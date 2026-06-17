import { BadRequestException } from '@nestjs/common';

export const MAX_EVIDENCE_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_EVIDENCE_REQUEST_BYTES = 100 * 1024 * 1024;

export const EVIDENCE_FORMATS = [
  'JPG',
  'JPEG',
  'PNG',
  'WEBP',
  'HEIC',
  'HEIF',
] as const;

export type EvidenceFileFormat = (typeof EVIDENCE_FORMATS)[number];

export type EvidenceFileInput = {
  mimetype?: string;
  originalname?: string;
  buffer?: Buffer;
  size?: number;
};

export type ResolvedEvidenceFile = {
  formatoOriginal: EvidenceFileFormat;
  storageContentType: string;
  storageExtension: string;
};

const EVIDENCE_FORMATS_MESSAGE = EVIDENCE_FORMATS.join(', ');

const MIME_TO_FORMAT: Record<string, EvidenceFileFormat> = {
  'image/jpg': 'JPG',
  'image/jpeg': 'JPEG',
  'image/pjpeg': 'JPEG',
  'image/png': 'PNG',
  'image/x-png': 'PNG',
  'image/webp': 'WEBP',
  'image/heic': 'HEIC',
  'image/heic-sequence': 'HEIC',
  'image/heif': 'HEIF',
  'image/heif-sequence': 'HEIF',
};

const FORMAT_TO_STORAGE_MIME: Record<EvidenceFileFormat, string> = {
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
};

const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

export class EvidenceFilePolicy {
  static readonly allowedFormats = [...EVIDENCE_FORMATS];
  static readonly maxFileBytes = MAX_EVIDENCE_FILE_BYTES;
  static readonly maxRequestBytes = MAX_EVIDENCE_REQUEST_BYTES;

  static validateRequest(files: EvidenceFileInput[]): void {
    const totalBytes = files.reduce(
      (sum, file) => sum + this.assertBuffer(file).length,
      0,
    );

    if (totalBytes > MAX_EVIDENCE_REQUEST_BYTES) {
      throw new BadRequestException(
        `El tamaño total de evidencias supera ${MAX_EVIDENCE_REQUEST_BYTES} bytes`,
      );
    }

    for (const file of files) {
      this.validateFile(file);
    }
  }

  static validateFile(file: EvidenceFileInput): ResolvedEvidenceFile {
    const buffer = this.assertBuffer(file);

    if (buffer.length > MAX_EVIDENCE_FILE_BYTES) {
      throw new BadRequestException(
        `Archivo ${file.originalname || 'sin_nombre'} supera ${MAX_EVIDENCE_FILE_BYTES} bytes`,
      );
    }

    return this.resolve(file);
  }

  static resolve(file: EvidenceFileInput): ResolvedEvidenceFile {
    const mimeType = String(file.mimetype ?? '')
      .trim()
      .toLowerCase();
    const formatFromMime = MIME_TO_FORMAT[mimeType];

    if (formatFromMime) {
      return this.buildResult(formatFromMime);
    }

    const extension = this.resolveExtension(file.originalname);
    if (GENERIC_MIME_TYPES.has(mimeType) && extension) {
      return this.buildResult(extension);
    }

    const rejectedFormat =
      this.formatFromMime(mimeType) || extension || 'DESCONOCIDO';
    throw new BadRequestException(
      `Formato ${rejectedFormat} no permitido. Solo ${EVIDENCE_FORMATS_MESSAGE}`,
    );
  }

  private static assertBuffer(file: EvidenceFileInput): Buffer {
    if (!Buffer.isBuffer(file?.buffer)) {
      throw new BadRequestException(
        'No se pudo procesar el archivo de evidencia. Verifica multipart/form-data.',
      );
    }

    return file.buffer;
  }

  private static resolveExtension(
    originalname?: string,
  ): EvidenceFileFormat | null {
    const extension = String(originalname ?? '')
      .split('.')
      .pop()
      ?.trim()
      .toUpperCase();

    if (!this.isAllowedFormat(extension)) {
      return null;
    }

    return extension;
  }

  private static formatFromMime(mimeType: string): string | null {
    const subtype = mimeType.split('/')[1]?.trim();
    if (!subtype) {
      return null;
    }

    return subtype.toUpperCase();
  }

  private static isAllowedFormat(
    formato: string | undefined,
  ): formato is EvidenceFileFormat {
    return EVIDENCE_FORMATS.includes(formato as EvidenceFileFormat);
  }

  private static buildResult(
    formatoOriginal: EvidenceFileFormat,
  ): ResolvedEvidenceFile {
    return {
      formatoOriginal,
      storageContentType: FORMAT_TO_STORAGE_MIME[formatoOriginal],
      storageExtension:
        formatoOriginal === 'JPG' || formatoOriginal === 'JPEG'
          ? 'jpg'
          : formatoOriginal.toLowerCase(),
    };
  }
}
