import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { parseUsuariosAdministracionQuery } from '../dto/usuarios-administracion.dto';
import { UsuariosAdministracionService } from './usuarios-administracion.service';

const actor: VerifiedActor = {
  usuario_id: '9007199254740993',
  auth_id: 'admin-fixture',
  rol: 'ADMIN',
};
const observado_en = '2026-11-03T16:00:00.000Z';
const usuario = (usuario_id = '9007199254740995') => ({
  usuario_id,
  nombre: 'José',
  username: 'jose-fixture',
  rol_global: 'VOLUNTARIO',
  activo: true,
  revision_autoridad: '9007199254740997',
});

describe('Usuarios administrativos: entrada estricta', () => {
  it('permite listado inicial y normaliza búsqueda NFC con filtros', () => {
    expect(parseUsuariosAdministracionQuery({})).toEqual({
      consulta: null,
      rol_global: null,
      cursor: null,
      limite: 20,
    });
    expect(
      parseUsuariosAdministracionQuery({
        consulta: '  Jose\u0301_%  ',
        rol_global: 'VALIDADOR',
        limite: '1',
      }),
    ).toEqual({
      consulta: 'José_%',
      rol_global: 'VALIDADOR',
      cursor: null,
      limite: 1,
    });
  });

  it.each([
    { consulta: '' },
    { consulta: ' ' },
    { consulta: 'A' },
    { consulta: 'a'.repeat(101) },
    { consulta: ['Ana', 'José'] },
    { rol_global: 'admin' },
    { rol_global: 'PLANTADOR' },
    { rol_global: null },
    { limite: 20 },
    { limite: '0' },
    { limite: '21' },
    { limite: '01' },
    { limite: '1.5' },
    { cursor: '' },
    { cursor: null },
    { cursor: 'x'.repeat(1025) },
    { actor_id: '1' },
    { activo: 'true' },
    { rol: 'ADMIN' },
  ])('rechaza entrada fuera del contrato %j', (query) => {
    expect(() => parseUsuariosAdministracionQuery(query)).toThrow(
      HttpException,
    );
  });
});

describe('Usuarios administrativos: lectura privada y paginación', () => {
  let rpc: jest.Mock;
  let service: UsuariosAdministracionService;

  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({
      data: { data: [usuario()], observado_en },
      error: null,
    });
    service = new UsuariosAdministracionService(
      { getAdminClient: () => ({ rpc }) } as unknown as SupabaseService,
      { get: () => 'usuarios-cursor-fixture' } as unknown as ConfigService,
    );
  });

  it('conserva BIGINT/revisión y consulta exclusivamente con identidad verificada', async () => {
    const result = await service.listar(
      actor,
      parseUsuariosAdministracionQuery({
        consulta: 'José',
        rol_global: 'VOLUNTARIO',
      }),
    );
    expect(result).toEqual({
      data: [usuario()],
      observado_en,
      siguiente_cursor: null,
    });
    expect(rpc).toHaveBeenCalledWith('pa_usuarios_administracion_leer', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_consulta: 'José',
      p_rol_global: 'VOLUNTARIO',
      p_despues_id: null,
      p_limite: 21,
    });
  });

  it.each(['GENERAL', 'VALIDADOR', 'VOLUNTARIO', 'ADMINISTRADOR_SUBCAMPANIA'])(
    'rechaza el rol %s sin consultar el directorio',
    async (rol) => {
      await expect(
        service.listar({ ...actor, rol }, parseUsuariosAdministracionQuery({})),
      ).rejects.toMatchObject({ status: 403 });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('admite username ausente de una cuenta legada como null', async () => {
    rpc.mockResolvedValueOnce({
      data: { data: [{ ...usuario(), username: null }], observado_en },
      error: null,
    });
    const result = await service.listar(
      actor,
      parseUsuariosAdministracionQuery({}),
    );
    expect(result.data[0].username).toBeNull();
  });

  it('pagina por ID sin perder precisión y liga cursor a cuenta, sesión y filtros', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        data: [usuario('9007199254740995'), usuario('9007199254740997')],
        observado_en,
      },
      error: null,
    });
    const query = parseUsuariosAdministracionQuery({
      consulta: 'José',
      limite: '1',
    });
    const first = await service.listar(actor, query);
    expect(first.data).toEqual([usuario('9007199254740995')]);
    expect(first.siguiente_cursor).toEqual(expect.any(String));
    rpc.mockResolvedValueOnce({
      data: { data: [usuario('9007199254740997')], observado_en },
      error: null,
    });
    await service.listar(actor, { ...query, cursor: first.siguiente_cursor });
    expect(rpc).toHaveBeenLastCalledWith(
      'pa_usuarios_administracion_leer',
      expect.objectContaining({
        p_despues_id: '9007199254740995',
        p_limite: 2,
      }),
    );
    const count = rpc.mock.calls.length;
    for (const [otherActor, otherQuery] of [
      [{ ...actor, usuario_id: '2' }, query],
      [{ ...actor, auth_id: 'otra-sesion' }, query],
      [actor, { ...query, consulta: 'Ana' }],
      [actor, { ...query, rol_global: 'ADMIN' }],
    ] as const) {
      await expect(
        service.listar(otherActor, {
          ...otherQuery,
          cursor: first.siguiente_cursor,
        }),
      ).rejects.toMatchObject({ status: 422 });
    }
    await expect(
      service.listar(actor, { ...query, cursor: `${first.siguiente_cursor}x` }),
    ).rejects.toMatchObject({ status: 422 });
    expect(rpc).toHaveBeenCalledTimes(count);
  });

  it('distingue lista vacía de indisponibilidad y pérdida de autoridad vigente en SQL', async () => {
    rpc.mockResolvedValueOnce({
      data: { data: [], observado_en },
      error: null,
    });
    expect(
      (await service.listar(actor, parseUsuariosAdministracionQuery({}))).data,
    ).toEqual([]);
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PT403',
        details: JSON.stringify({
          codigo: 'CAPACIDAD_INSUFICIENTE',
          mensaje: 'No tiene capacidad para esta operación.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        }),
      },
    });
    await expect(
      service.listar(actor, parseUsuariosAdministracionQuery({})),
    ).rejects.toMatchObject({ status: 403 });
    rpc.mockRejectedValueOnce(new Error('detalle privado de infraestructura'));
    await expect(
      service.listar(actor, parseUsuariosAdministracionQuery({})),
    ).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    { data: null, observado_en },
    { data: [usuario()], observado_en: 'fecha-invalida' },
    { data: [{ ...usuario(), usuario_id: 9007199254740995 }], observado_en },
    { data: [{ ...usuario(), revision_autoridad: 1 }], observado_en },
    { data: [{ ...usuario(), activo: false }], observado_en },
    { data: [{ ...usuario(), rol_global: 'PLANTADOR' }], observado_en },
    { data: [{ ...usuario(), correo: 'privado@example.test' }], observado_en },
    { data: [usuario('3'), usuario('2')], observado_en },
    { data: [usuario('2'), usuario('2')], observado_en },
  ])('falla cerrado ante respuesta SQL incompatible %j', async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(
      service.listar(actor, parseUsuariosAdministracionQuery({})),
    ).rejects.toMatchObject({ status: 503 });
  });
});
