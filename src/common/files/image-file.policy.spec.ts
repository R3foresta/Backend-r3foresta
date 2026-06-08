import { BadRequestException } from '@nestjs/common';
import { ImageFilePolicy } from './image-file.policy';

describe('ImageFilePolicy', () => {
  it.each([
    ['image/jpeg', 'foto.jpg', 'JPEG', 'image/jpeg'],
    ['image/jpg', 'foto.jpg', 'JPG', 'image/jpeg'],
    ['image/png', 'foto.png', 'PNG', 'image/png'],
    ['image/webp', 'foto.webp', 'WEBP', 'image/webp'],
    ['image/heic', 'foto.heic', 'HEIC', 'image/heic'],
    ['image/heif', 'foto.heif', 'HEIF', 'image/heif'],
  ])(
    'acepta %s como formato de imagen soportado',
    (mimetype, originalname, formato, mimeType) => {
      expect(
        ImageFilePolicy.assertAllowedImage({
          mimetype,
          originalname,
          buffer: Buffer.from('foto'),
        }),
      ).toMatchObject({ formato, mimeType });
    },
  );

  it('usa la extension cuando el navegador envia MIME generico', () => {
    expect(
      ImageFilePolicy.assertAllowedImage({
        mimetype: 'application/octet-stream',
        originalname: 'IMG_0001.HEIC',
        buffer: Buffer.from('foto'),
      }),
    ).toMatchObject({
      formato: 'HEIC',
      mimeType: 'image/heic',
    });
  });

  it('rechaza MIME no imagen aunque el nombre tenga extension permitida', () => {
    expect(() =>
      ImageFilePolicy.assertAllowedImage({
        mimetype: 'application/pdf',
        originalname: 'documento.jpg',
        buffer: Buffer.from('pdf'),
      }),
    ).toThrow(BadRequestException);
  });

  it('requiere buffer cuando el flujo necesita multipart procesado por Multer', () => {
    expect(() =>
      ImageFilePolicy.assertAllowedImage(
        {
          mimetype: 'image/heic',
          originalname: 'foto.heic',
        },
        { requireBuffer: true },
      ),
    ).toThrow(BadRequestException);
  });
});
