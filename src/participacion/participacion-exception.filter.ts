import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ParticipacionExceptionFilter implements ExceptionFilter {
  protected responseCache(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Vary', 'Authorization');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 503;
    const content =
      exception instanceof HttpException ? exception.getResponse() : null;
    const command =
      (request.body as Record<string, unknown> | undefined)?.comando_id ??
      request.params?.comando_id;
    const comando_id =
      typeof command === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        command,
      )
        ? command
        : null;
    this.responseCache(response);
    if (
      content &&
      typeof content === 'object' &&
      'error' in content &&
      'resultado_concluyente' in content
    ) {
      response.status(status).json({ ...content, comando_id });
      return;
    }
    const record =
      content && typeof content === 'object'
        ? (content as Record<string, unknown>)
        : {};
    const raw = record.codigo ?? record.message ?? content;
    let codigo =
      status === 401
        ? 'SESION_INVALIDA'
        : status === 403
          ? 'CAPACIDAD_INSUFICIENTE'
          : status === 404
            ? 'RECURSO_NO_VISIBLE'
            : status === 400 || status === 413 || status === 422
              ? 'ENTRADA_INVALIDA'
              : 'RESULTADO_NO_DETERMINADO';
    if (
      status === 401 &&
      raw === 'x-auth-id no coincide con la sesión autenticada.'
    )
      codigo = 'IDENTIDAD_DISCORDANTE';
    if (status === 403 && raw === 'CUENTA_INACTIVA') codigo = 'CUENTA_INACTIVA';
    if (status === 422 && raw === 'CAMPO_NO_PERMITIDO')
      codigo = 'CAMPO_NO_PERMITIDO';
    const messages: Record<string, string> = {
      SESION_INVALIDA: 'La sesión no es válida.',
      IDENTIDAD_DISCORDANTE: 'La identidad no coincide con la sesión.',
      CUENTA_INACTIVA: 'La cuenta está inactiva.',
      CAPACIDAD_INSUFICIENTE: 'No tiene capacidad para esta operación.',
      RECURSO_NO_VISIBLE: 'El recurso no está disponible.',
      ENTRADA_INVALIDA: 'La entrada no cumple el contrato v1.',
      CAMPO_NO_PERMITIDO: 'La entrada contiene campos no permitidos.',
      RESULTADO_NO_DETERMINADO:
        'No se pudo determinar el resultado. Recupere el comando con la misma clave.',
    };
    response.status(status === 400 || status === 413 ? 422 : status).json({
      error: {
        codigo,
        mensaje: messages[codigo],
        campos: status === 413 ? ['foto'] : [],
        ambitos: [],
        reintento:
          status === 401 || codigo === 'CUENTA_INACTIVA'
            ? 'RECUPERAR_SESION'
            : codigo === 'RESULTADO_NO_DETERMINADO'
              ? 'MISMA_CLAVE'
              : 'NO_APLICA',
      },
      comando_id,
      resultado_concluyente: false,
    });
  }
}

@Catch()
export class ParticipacionPublicExceptionFilter extends ParticipacionExceptionFilter {
  protected override responseCache(response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
  }
}
