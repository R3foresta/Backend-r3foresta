import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  EvidenceFileFormat,
  EvidenceFileInput,
  EvidenceFilePolicy,
} from './evidence-file.policy';

export type PreparedEvidenceFile = {
  originalBuffer: Buffer;
  storageContentType: string;
  storageExtension: string;
  tamanoBytes: number;
  hashSha256: string;
  metadata: {
    nombre_original: string;
    mime_type_recibido: string;
    mime_type_resuelto: string;
    formato_original: EvidenceFileFormat;
    hash_algoritmo: 'sha256';
    archivo_original_preservado: true;
  };
};

@Injectable()
export class EvidenceFileService {
  prepareOriginalEvidenceFiles(
    files: EvidenceFileInput[],
  ): PreparedEvidenceFile[] {
    EvidenceFilePolicy.validateRequest(files);
    return files.map((file) => this.prepareOriginalEvidenceFile(file));
  }

  prepareOriginalEvidenceFile(file: EvidenceFileInput): PreparedEvidenceFile {
    const resolved = EvidenceFilePolicy.validateFile(file);
    const originalBuffer = file.buffer as Buffer;
    const hashSha256 = createHash('sha256')
      .update(originalBuffer)
      .digest('hex');

    return {
      originalBuffer,
      storageContentType: resolved.storageContentType,
      storageExtension: resolved.storageExtension,
      tamanoBytes: originalBuffer.length,
      hashSha256,
      metadata: {
        nombre_original: String(file.originalname ?? ''),
        mime_type_recibido: String(file.mimetype ?? ''),
        mime_type_resuelto: resolved.storageContentType,
        formato_original: resolved.formatoOriginal,
        hash_algoritmo: 'sha256',
        archivo_original_preservado: true,
      },
    };
  }
}
