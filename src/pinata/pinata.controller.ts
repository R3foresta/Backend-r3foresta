import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PinataService } from './pinata.service';
import { UploadJsonDto } from './dto/upload-json.dto';

@Controller('pinata')
export class PinataController {
  constructor(private readonly pinataService: PinataService) {}

  /**
   * Endpoint para subir un JSON
   * POST /api/pinata/upload-json
   * Body: { data: any, filename?: string }
   */
  @Post('upload-json')
  async uploadJson(@Body() body: UploadJsonDto) {
    // Validación: el campo "data" es obligatorio
    if (!body.data) {
      throw new HttpException(
        'Se requiere el campo "data" en el body',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Llamar al servicio para subir el JSON
      return await this.pinataService.uploadJson(
        body.data,
        body.filename || 'data.json',
      );
    } catch (error: unknown) {
      // Manejo de errores
      const errorMessage =
        error instanceof Error ? error.message : 'Error al subir el JSON';
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
