import sharp from 'sharp';
import { ParticipacionImagenService } from './participacion-imagen.service';

describe('Cola limitada de fotografías públicas', () => {
  it('descarga y sanitiza siete fotos en espera con un máximo de dos descargas activas', async () => {
    const service = new ParticipacionImagenService();
    const original = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#fff' },
    })
      .withExif({ IFD0: { Artist: 'privado' } })
      .jpeg()
      .toBuffer();
    let active = 0;
    let maximum = 0;
    const photos = await Promise.all(
      Array.from({ length: 7 }, () =>
        service.prepararPublica(async () => {
          active++;
          maximum = Math.max(maximum, active);
          await new Promise<void>((resolve) => setImmediate(resolve));
          active--;
          return original;
        }),
      ),
    );
    expect(maximum).toBeLessThanOrEqual(2);
    for (const photo of photos) {
      const metadata = await sharp(photo).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.exif).toBeUndefined();
    }
  });

  function controlledService() {
    const service = new ParticipacionImagenService();
    const image = Buffer.from('fixture');
    jest.spyOn(service, 'preparar').mockResolvedValue({
      original: image,
      derivada: image,
      mimeOriginal: 'image/jpeg',
      hashOriginal: 'fixture',
      hashDerivada: 'fixture',
    });
    let release!: (image: Buffer) => void;
    const gate = new Promise<Buffer>((resolve) => {
      release = resolve;
    });
    return { service, image, gate, release };
  }

  it('limita la espera a32 trabajos sin descargar sus originales; el exceso devuelve503', async () => {
    const { service, image, gate, release } = controlledService();
    const loader = jest.fn(() => gate);
    const jobs = Array.from({ length: 34 }, () =>
      service.prepararPublica(loader),
    );
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(service.prepararPublica(loader)).rejects.toMatchObject({
      status: 503,
    });
    release(image);
    expect(await Promise.all(jobs)).toHaveLength(34);
    expect(loader).toHaveBeenCalledTimes(34);
  });

  it('retira una espera vencida sin iniciar su descarga', async () => {
    jest.useFakeTimers();
    try {
      const { service, image, gate, release } = controlledService();
      const running = [
        service.prepararPublica(() => gate),
        service.prepararPublica(() => gate),
      ];
      const pendingLoader = jest.fn(() => Promise.resolve(image));
      const timeout = expect(
        service.prepararPublica(pendingLoader),
      ).rejects.toMatchObject({ status: 503 });
      jest.advanceTimersByTime(30_000);
      await timeout;
      expect(pendingLoader).not.toHaveBeenCalled();
      release(image);
      await Promise.all(running);
    } finally {
      jest.useRealTimers();
    }
  });

  it('un error de descarga no bloquea las fotografías siguientes', async () => {
    const { service, image } = controlledService();
    const failed = service.prepararPublica(() =>
      Promise.reject(new Error('fixture')),
    );
    const following = Array.from({ length: 7 }, () =>
      service.prepararPublica(() => Promise.resolve(image)),
    );
    await expect(failed).rejects.toThrow('fixture');
    expect(await Promise.all(following)).toHaveLength(7);
  });
});
