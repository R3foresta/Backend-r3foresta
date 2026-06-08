import { BadRequestException } from '@nestjs/common';

export type ImageFileInput = {
  mimetype?: string;
  originalname?: string;
  buffer?: Buffer;
};

export type ResolvedImageFile = {
  formato: string;
  mimeType: string;
  extension: string;
};

type AssertImageOptions = {
  requireBuffer?: boolean;
};

const ALLOWED_FORMATS = ['JPG', 'JPEG', 'PNG', 'WEBP', 'HEIC', 'HEIF'] as const;
type AllowedImageFormat = (typeof ALLOWED_FORMATS)[number];
const ALLOWED_FORMATS_MESSAGE = ALLOWED_FORMATS.join(', ');

const MIME_TO_FORMAT: Record<string, AllowedImageFormat> = {
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

const FORMAT_TO_MIME: Record<AllowedImageFormat, string> = {
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

export class ImageFilePolicy {
  static readonly allowedFormats = [...ALLOWED_FORMATS];
  static readonly allowedFormatsMessage = ALLOWED_FORMATS_MESSAGE;

  static assertAllowedImage(
    file: ImageFileInput,
    options: AssertImageOptions = {},
  ): ResolvedImageFile {
    if (options.requireBuffer && !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException(
        'No se pudieron procesar las fotos enviadas. Verifica multipart/form-data.',
      );
    }

    return this.resolve(file);
  }

  static resolve(file: ImageFileInput): ResolvedImageFile {
    const mimeType = String(file.mimetype ?? '')
      .trim()
      .toLowerCase();
    const formatoFromMime = MIME_TO_FORMAT[mimeType];

    if (formatoFromMime) {
      return this.buildResult(formatoFromMime);
    }

    const extension = this.resolveExtension(file.originalname);
    if (GENERIC_MIME_TYPES.has(mimeType) && extension) {
      return this.buildResult(extension);
    }

    const rejectedFormat =
      this.formatFromMime(mimeType) || extension || 'DESCONOCIDO';
    throw new BadRequestException(
      `Formato ${rejectedFormat} no permitido. Solo ${ALLOWED_FORMATS_MESSAGE}`,
    );
  }

  private static resolveExtension(
    originalname?: string,
  ): AllowedImageFormat | null {
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
  ): formato is AllowedImageFormat {
    return ALLOWED_FORMATS.includes(formato as AllowedImageFormat);
  }

  private static buildResult(formato: AllowedImageFormat): ResolvedImageFile {
    return {
      formato,
      mimeType: FORMAT_TO_MIME[formato],
      extension: formato === 'JPEG' ? 'jpg' : formato.toLowerCase(),
    };
  }
}
