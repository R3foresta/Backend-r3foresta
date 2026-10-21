import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

export const MAX_FOTO_BYTES = 10 * 1024 * 1024;
export const MAX_FOTO_PIXELES = 40_000_000;
export type ImagenPreparada = {
  original: Buffer;
  derivada: Buffer;
  mimeOriginal: string;
  hashOriginal: string;
  hashDerivada: string;
};
type FotoPublicaPendiente = {
  cargar: () => Promise<Buffer>;
  resolver: (bytes: Buffer) => void;
  rechazar: (error: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Un worker por archivo limita tiempo, heap y concurrencia sin ejecutar decoders
// sobre el event loop HTTP. No carga metadata ni nombre elegido por el cliente.
const decoder = String.raw`
const {parentPort,workerData} = require('node:worker_threads');
(async () => {
  const sharp = require(workerData.sharp);
  sharp.cache(false);
  const bytes = Buffer.from(workerData.bytes);
  const max = workerData.maxPixels;
  let pipeline, mime;
  const brand = bytes.subarray(8,12).toString('ascii');
  const heif = bytes.subarray(4,8).toString('ascii') === 'ftyp' && ['heic','heix','hevc','hevx','mif1','msf1'].includes(brand);
  if (heif) {
    const heic = require(workerData.heic);
    const images = await heic.all({buffer:bytes});
    try {
      if(images.length !== 1 || images[0].width * images[0].height > max || images[0].width<1 || images[0].height<1) throw new Error('dimensions');
      const raw = await images[0].decode();
      pipeline = sharp(Buffer.from(raw.data),{raw:{width:raw.width,height:raw.height,channels:4},limitInputPixels:max});
      mime = ['mif1','msf1'].includes(brand) ? 'image/heif' : 'image/heic';
    } finally { images.dispose(); }
  } else {
    pipeline = sharp(bytes,{failOn:'warning',limitInputPixels:max,animated:false});
    const metadata = await pipeline.metadata();
    mime = {jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[metadata.format];
    if (!mime || !metadata.width || !metadata.height || metadata.width*metadata.height>max || (metadata.pages || 1)>1) throw new Error('format');
  }
  // sharp elimina EXIF/XMP/ICC por defecto. rotate aplica orientación antes de
  // quitarla. JPEG opaco, sRGB y tamaño acotado para cualquier audiencia.
  const output = await pipeline.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).toColourspace('srgb').jpeg({quality:85,mozjpeg:true}).toBuffer();
  parentPort.postMessage({mime,bytes:output});
})().catch(() => parentPort.postMessage({error:true}));
`;

@Injectable()
export class ParticipacionImagenService {
  private enProceso = 0;
  private descargandoPublicas = 0;
  private readonly publicasPendientes: FotoPublicaPendiente[] = [];

  // Encolar antes de descargar: no retener 32 originales grandes en memoria.
  // La cola solo se usa para lecturas públicas; las cargas conservan su contrato.
  prepararPublica(cargar: () => Promise<Buffer>): Promise<Buffer> {
    if (this.publicasPendientes.length >= 32)
      return Promise.reject(
        new ServiceUnavailableException(
          'Imágenes ocupadas. Reintente la lectura.',
        ),
      );
    return new Promise((resolver, rechazar) => {
      const trabajo: FotoPublicaPendiente = { cargar, resolver, rechazar };
      trabajo.timer = setTimeout(() => {
        const index = this.publicasPendientes.indexOf(trabajo);
        if (index < 0) return;
        this.publicasPendientes.splice(index, 1);
        rechazar(
          new ServiceUnavailableException(
            'La imagen no pudo prepararse a tiempo. Reintente la lectura.',
          ),
        );
      }, 30_000);
      this.publicasPendientes.push(trabajo);
      this.drenarPublicas();
    });
  }

  private drenarPublicas(): void {
    while (
      this.publicasPendientes.length &&
      this.enProceso + this.descargandoPublicas < 2
    ) {
      const trabajo = this.publicasPendientes.shift()!;
      clearTimeout(trabajo.timer);
      this.descargandoPublicas++;
      void this.ejecutarPublica(trabajo);
    }
  }

  private async ejecutarPublica(trabajo: FotoPublicaPendiente): Promise<void> {
    let descargando = true;
    try {
      const bytes = await trabajo.cargar();
      this.descargandoPublicas--;
      descargando = false;
      trabajo.resolver((await this.preparar(bytes)).derivada);
    } catch (error) {
      trabajo.rechazar(error);
    } finally {
      if (descargando) this.descargandoPublicas--;
      this.drenarPublicas();
    }
  }

  async preparar(bytes: Buffer): Promise<ImagenPreparada> {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > MAX_FOTO_BYTES
    )
      this.fallar(
        422,
        'FOTO_INVALIDA',
        'La foto debe tener entre 1 byte y 10 MiB.',
      );
    if (this.enProceso + this.descargandoPublicas >= 2)
      this.fallar(503, 'DECODIFICADOR_OCUPADO', 'Reintente la misma carga.');
    this.enProceso++;
    let workerCreado = false;
    try {
      const result = await new Promise<{ mime: string; bytes: Uint8Array }>(
        (resolve, reject) => {
          const worker = new Worker(decoder, {
            eval: true,
            stdout: true,
            stderr: true,
            workerData: {
              sharp: require.resolve('sharp'),
              heic: require.resolve('heic-decode'),
              bytes,
              maxPixels: MAX_FOTO_PIXELES,
            },
            resourceLimits: {
              maxOldGenerationSizeMb: 256,
              maxYoungGenerationSizeMb: 32,
            },
          });
          workerCreado = true;
          worker.stdout?.resume();
          worker.stderr?.resume();
          let settled = false;
          const finish = (
            error?: Error,
            value?: { mime: string; bytes: Uint8Array },
          ) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            void worker.terminate();
            if (error) reject(error);
            else resolve(value!);
          };
          const timer = setTimeout(() => finish(new Error('timeout')), 15_000);
          worker.once(
            'message',
            (value: { error: true } | { mime: string; bytes: Uint8Array }) =>
              'error' in value
                ? finish(new Error('decode'))
                : finish(undefined, value),
          );
          worker.once('error', (error) => finish(error));
          worker.once('exit', () => {
            // Un timeout HTTP no libera capacidad hasta que el worker realmente
            // termina; una operación nativa aún en curso no abre más decoders.
            this.enProceso--;
            this.drenarPublicas();
            finish(new Error('exit'));
          });
        },
      );
      const derivada = Buffer.from(result.bytes);
      return {
        original: bytes,
        derivada,
        mimeOriginal: result.mime,
        hashOriginal: hashBytes(bytes),
        hashDerivada: hashBytes(derivada),
      };
    } catch {
      return this.fallar(
        422,
        'FOTO_NO_DECODIFICABLE',
        'La foto no se pudo decodificar. Se admiten JPG, PNG, WEBP, HEIC y HEIF de una imagen, hasta 40 megapíxeles.',
      );
    } finally {
      if (!workerCreado) {
        this.enProceso--;
        this.drenarPublicas();
      }
    }
  }
  private fallar(status: number, codigo: string, mensaje: string): never {
    throw new HttpException(
      {
        error: {
          codigo,
          mensaje,
          campos: ['foto'],
          ambitos: [],
          reintento: 'MISMA_CLAVE',
        },
        comando_id: null,
        resultado_concluyente: false,
      },
      status,
    );
  }
}
