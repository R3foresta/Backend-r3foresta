import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  EvidenceFileInput,
  EvidenceFilePolicy,
  MAX_EVIDENCE_FILE_BYTES,
  MAX_EVIDENCE_REQUEST_BYTES,
} from './evidence-file.policy';
import { EvidenceFileService } from './evidence-file.service';

describe('EvidenceFilePolicy', () => {
  const service = new EvidenceFileService();

  const file = (
    overrides: Partial<EvidenceFileInput> = {},
  ): EvidenceFileInput => ({
    mimetype: 'image/jpeg',
    originalname: 'foto.jpg',
    buffer: Buffer.from('foto original'),
    ...overrides,
  });

  it.each([
    ['image/jpg', 'foto.jpg', 'JPG', 'image/jpeg', 'jpg'],
    ['image/jpeg', 'foto.jpeg', 'JPEG', 'image/jpeg', 'jpg'],
    ['image/png', 'foto.png', 'PNG', 'image/png', 'png'],
    ['image/webp', 'foto.webp', 'WEBP', 'image/webp', 'webp'],
    ['image/heic', 'foto.heic', 'HEIC', 'image/heic', 'heic'],
    ['image/heif', 'foto.heif', 'HEIF', 'image/heif', 'heif'],
  ])(
    'prepara %s como evidencia original auditable',
    (mimetype, originalname, formato, storageContentType, storageExtension) => {
      const buffer = Buffer.from(`contenido-${formato}`);
      const prepared = service.prepareOriginalEvidenceFile(
        file({ mimetype, originalname, buffer }),
      );

      expect(prepared).toMatchObject({
        originalBuffer: buffer,
        storageContentType,
        storageExtension,
        tamanoBytes: buffer.length,
        hashSha256: createHash('sha256').update(buffer).digest('hex'),
        metadata: {
          nombre_original: originalname,
          mime_type_recibido: mimetype,
          mime_type_resuelto: storageContentType,
          formato_original: formato,
          hash_algoritmo: 'sha256',
          archivo_original_preservado: true,
        },
      });
    },
  );

  it('acepta application/octet-stream cuando la extension es valida', () => {
    const prepared = service.prepareOriginalEvidenceFile(
      file({
        mimetype: 'application/octet-stream',
        originalname: 'IMG_0001.HEIC',
      }),
    );

    expect(prepared).toMatchObject({
      storageContentType: 'image/heic',
      storageExtension: 'heic',
      metadata: {
        mime_type_recibido: 'application/octet-stream',
        formato_original: 'HEIC',
      },
    });
  });

  it.each([
    ['application/pdf', 'documento.pdf'],
    ['text/plain', 'notas.txt'],
  ])('rechaza %s', (mimetype, originalname) => {
    expect(() =>
      service.prepareOriginalEvidenceFile(file({ mimetype, originalname })),
    ).toThrow(BadRequestException);
  });

  it('rechaza archivo sin buffer', () => {
    expect(() =>
      service.prepareOriginalEvidenceFile(
        file({ buffer: undefined }) as EvidenceFileInput,
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza archivo sobre el limite individual', () => {
    expect(() =>
      service.prepareOriginalEvidenceFile(
        file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES + 1) }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza request total sobre el limite', () => {
    const files = [
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({ buffer: Buffer.alloc(MAX_EVIDENCE_FILE_BYTES) }),
      file({
        buffer: Buffer.alloc(MAX_EVIDENCE_REQUEST_BYTES - 90 * 1024 * 1024 + 1),
      }),
    ];

    expect(() => service.prepareOriginalEvidenceFiles(files)).toThrow(
      BadRequestException,
    );
  });

  it('calcula el hash sobre el buffer original', () => {
    const buffer = Buffer.from([0, 1, 2, 3, 255]);
    const prepared = service.prepareOriginalEvidenceFile(file({ buffer }));

    expect(prepared.originalBuffer).toBe(buffer);
    expect(prepared.hashSha256).toBe(
      createHash('sha256').update(buffer).digest('hex'),
    );
  });

  it('valida request dentro del limite total', () => {
    expect(() =>
      EvidenceFilePolicy.validateRequest([
        file({ buffer: Buffer.alloc(1024) }),
        file({ buffer: Buffer.alloc(2048) }),
      ]),
    ).not.toThrow();
  });
});
