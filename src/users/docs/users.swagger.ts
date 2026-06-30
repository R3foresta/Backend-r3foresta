import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticación del usuario (auth_id de Supabase)',
  required: true,
};

export function ApiListarUsuarios() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar usuarios (selector)',
      description:
        'Devuelve `{ id, nombre, rol, foto_perfil_url }` ordenado por nombre. Pensado para autocompletes/selectores. Requiere header `x-auth-id`.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiQuery({
      name: 'q',
      required: false,
      type: String,
      description: 'Filtro por nombre (búsqueda ILIKE %q%).',
    }),
    ApiQuery({
      name: 'rol',
      required: false,
      type: String,
      description: 'Filtra por rol exacto (se compara en mayúsculas).',
    }),
    ApiResponse({ status: 200, description: 'Lista de usuarios.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
  );
}

export function ApiObtenerPerfil() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener perfil del usuario autenticado',
      description:
        'Devuelve el usuario asociado al `x-auth-id`. En producción acepta también `Authorization: Bearer <jwt>`.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiResponse({ status: 200, description: 'Perfil del usuario.' }),
    ApiResponse({ status: 401, description: 'No autenticado.' }),
    ApiResponse({ status: 404, description: 'Usuario no encontrado.' }),
  );
}

export function ApiCompletarRegistro() {
  return applyDecorators(
    ApiOperation({
      summary: 'Completar formulario de registro',
      description:
        'Completa los datos del usuario tras el alta WebAuthn. Requiere `x-auth-id` (o JWT en producción).',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiResponse({ status: 201, description: 'Datos guardados.' }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'No autenticado.' }),
    ApiResponse({
      status: 409,
      description: 'Documento o wallet ya registrados por otro usuario.',
    }),
  );
}

export function ApiActualizarFotoPerfil() {
  return applyDecorators(
    ApiOperation({
      summary: 'Actualizar foto de perfil',
      description:
        'Sube la foto al bucket `imagenes-perfil` y guarda la URL en `usuario.foto_perfil_url`. Formato `multipart/form-data`, campo `file`. Máximo 2 MB. Acepta png/jpg/jpeg/webp.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Imagen png/jpg/jpeg/webp, máx 2 MB.',
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Foto actualizada.' }),
    ApiResponse({
      status: 400,
      description: 'Archivo inválido o error al guardar.',
    }),
    ApiResponse({ status: 401, description: 'No autenticado.' }),
  );
}
