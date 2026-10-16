import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ParticipacionImagenService,
  MAX_FOTO_BYTES,
  hashBytes,
} from './participacion-imagen.service';

describe('ParticipacionImagenService (decodificación real)', () => {
  const service = new ParticipacionImagenService();
  jest.setTimeout(30_000);

  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodifica %s y deriva JPEG sin EXIF ni texto',
    async (format) => {
      const image = await sharp({
        create: { width: 3, height: 2, channels: 3, background: '#33aa44' },
      })
        .withExif({ IFD0: { Artist: 'No publicar' } })
        .toFormat(format)
        .toBuffer();
      const result = await service.preparar(image);
      expect(result.original).toEqual(image);
      expect(result.hashOriginal).toBe(hashBytes(image));
      expect(result.hashDerivada).toBe(hashBytes(result.derivada));
      expect(result.mimeOriginal).toBe(`image/${format}`);
      const metadata = await sharp(result.derivada).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      await expect(
        sharp(result.derivada).raw().toBuffer(),
      ).resolves.toBeInstanceOf(Buffer);
    },
  );

  it('decodifica HEIC real con libheif y produce JPEG sanitizado', async () => {
    const bytes = readFileSync(
      join(process.cwd(), 'test/db/fixtures/pa-int03a/sintetica.heic'),
    );
    const result = await service.preparar(bytes);
    expect(result.mimeOriginal).toBe('image/heic');
    expect(result.hashOriginal).toBe(
      'ebeb0363f833465546726dd5e3856bb30036af146ab05bd661751452da24eda3',
    );
    const metadata = await sharp(result.derivada).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(3);
    expect(metadata.height).toBe(2);
  });

  it('decodifica el contenedor HEIF real con marca general mif1', async () => {
    // La misma imagen HEVC mantiene sus cajas/payload; cambiar la marca mayor
    // compatible a mif1 declara el contenedor general HEIF y libheif lo valida.
    const bytes = Buffer.from(
      readFileSync(
        join(process.cwd(), 'test/db/fixtures/pa-int03a/sintetica.heic'),
      ),
    );
    bytes.write('mif1', 8, 'ascii');
    const result = await service.preparar(bytes);
    expect(result.mimeOriginal).toBe('image/heif');
    const metadata = await sharp(result.derivada).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(3);
    expect(metadata.height).toBe(2);
    expect(metadata.exif).toBeUndefined();
  });

  it('rechaza bytes que solo anuncian HEIC, truncados o SVG', async () => {
    for (const bytes of [
      Buffer.from('xxxxftypheic mentira'),
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      ),
    ]) {
      await expect(service.preparar(bytes)).rejects.toMatchObject({
        response: { error: { codigo: 'FOTO_NO_DECODIFICABLE' } },
      });
    }
  });

  it('rechaza vacío, más de 10 MiB y dimensiones fuera de 40 megapíxeles', async () => {
    await expect(service.preparar(Buffer.alloc(0))).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      service.preparar(Buffer.alloc(MAX_FOTO_BYTES + 1)),
    ).rejects.toMatchObject({ status: 422 });
    const large = await sharp({
      create: { width: 6500, height: 6500, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(service.preparar(large)).rejects.toMatchObject({
      status: 422,
    });
  });
});
