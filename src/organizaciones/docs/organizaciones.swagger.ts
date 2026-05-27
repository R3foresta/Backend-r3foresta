import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { TipoOrganizacion } from '../enums/tipo-organizacion.enum';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticacion del usuario de Supabase',
  required: true,
};

const TIPOS_ORG = Object.values(TipoOrganizacion);

export function ApiCrearOrganizacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear organizacion',
      description:
        'Crea una organizacion. multipart/form-data si incluye `logo`. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data', 'application/json'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['nombre', 'tipo'],
        properties: {
          nombre: {
            type: 'string',
            minLength: 2,
            maxLength: 200,
            example: 'Fundacion Verde Andina',
          },
          tipo: { type: 'string', enum: TIPOS_ORG, example: 'ONG' },
          activo: { type: 'boolean', default: true },
          logo: {
            type: 'string',
            format: 'binary',
            description:
              'Opcional. PNG/JPG/JPEG/WEBP, max 2 MB. Se guarda en el bucket "organizaciones".',
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'Organizacion creada.' }),
    ApiResponse({ status: 400, description: 'Datos invalidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede crear organizaciones.',
    }),
    ApiResponse({
      status: 422,
      description: 'Ya existe una organizacion con ese nombre.',
    }),
  );
}

export function ApiListarOrganizaciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar organizaciones',
      description:
        'Lista completa ordenada por nombre. Filtros opcionales: activo, tipo.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiQuery({
      name: 'activo',
      required: false,
      type: Boolean,
      description: 'Si se especifica, filtra por activo=true|false.',
    }),
    ApiQuery({
      name: 'tipo',
      required: false,
      enum: TIPOS_ORG,
      description: 'Filtra por tipo de organizacion.',
    }),
    ApiResponse({ status: 200, description: 'Lista de organizaciones.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
  );
}

export function ApiDetalleOrganizacion() {
  return applyDecorators(
    ApiOperation({ summary: 'Obtener detalle de una organizacion' }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Detalle de la organizacion.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Organizacion no encontrada.' }),
  );
}

export function ApiEditarOrganizacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Editar organizacion',
      description:
        'Actualiza nombre, tipo o activo. No maneja el logo (usar POST /:id/logo). Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          nombre: { type: 'string', minLength: 2, maxLength: 200 },
          tipo: { type: 'string', enum: TIPOS_ORG },
          activo: { type: 'boolean' },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Organizacion actualizada.' }),
    ApiResponse({ status: 400, description: 'Datos invalidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede editar organizaciones.',
    }),
    ApiResponse({ status: 404, description: 'Organizacion no encontrada.' }),
    ApiResponse({ status: 422, description: 'Nombre duplicado.' }),
  );
}

export function ApiSubirLogo() {
  return applyDecorators(
    ApiOperation({
      summary: 'Subir o reemplazar logo de la organizacion',
      description:
        'multipart/form-data, campo `logo` (PNG/JPG/JPEG/WEBP, max 2 MB). Reemplaza el logo anterior si existe. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['logo'],
        properties: {
          logo: { type: 'string', format: 'binary' },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'Logo actualizado.' }),
    ApiResponse({ status: 400, description: 'Archivo invalido.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede modificar el logo.',
    }),
    ApiResponse({ status: 404, description: 'Organizacion no encontrada.' }),
  );
}

export function ApiBorrarLogo() {
  return applyDecorators(
    ApiOperation({
      summary: 'Borrar el logo de la organizacion',
      description:
        'Pone logo_url en NULL y elimina el archivo del bucket "organizaciones". Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Logo eliminado.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede borrar el logo.',
    }),
    ApiResponse({ status: 404, description: 'Organizacion no encontrada.' }),
  );
}

export function ApiBorrarOrganizacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Borrar organizacion (hard delete)',
      description:
        'Solo si no esta referenciada en campania_organizacion. Si lo esta, devuelve 422 sugiriendo PATCH activo=false. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Organizacion eliminada.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede borrar organizaciones.',
    }),
    ApiResponse({ status: 404, description: 'Organizacion no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'La organizacion esta asociada a una o mas campañas.',
    }),
  );
}
