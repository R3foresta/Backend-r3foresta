import {
  HttpException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  parseBuscarPersonas,
  parseCapacidadesQuery,
  parseMiembrosQuery,
  parseRevisarAccesos,
} from '../dto/lecturas.dto';
import { ParticipacionLecturasService } from '../participacion-lecturas.service';

const actor: VerifiedActor = {
  usuario_id: '9007199254740993',
  auth_id: 'fixture-user',
  rol: 'VOLUNTARIO',
};
const observed = '2026-10-14T12:00:00Z';
const people = [
  { usuario_id: '2', nombre: 'Ana', organizacion: null },
  { usuario_id: '3', nombre: 'Ana', organizacion: 'Otra' },
];

describe('Lecturas v1: DTO estricto', () => {
  const input = {
    modo: 'NOMBRE',
    consulta: '  Jose\u0301  ',
    accion: 'OTORGAR_PLANTADOR',
    subcampania_ids: ['11', '9007199254740993'],
  };
  it('normaliza nombre NFC, mantiene IDs BIGINT y no interpreta comodines', () => {
    expect(parseBuscarPersonas(input)).toEqual({
      ...input,
      consulta: 'José',
      cursor: null,
      limite: 20,
    });
    expect(parseBuscarPersonas({ ...input, consulta: 'A_%' }).consulta).toBe(
      'A_%',
    );
    expect(
      parseBuscarPersonas({
        ...input,
        modo: 'CORREO_EXACTO',
        consulta: '  ana+grupo@ejemplo.test  ',
      }).consulta,
    ).toBe('ana+grupo@ejemplo.test');
  });
  it.each([
    { ...input, actor_id: '1' },
    { ...input, rol: 'ADMIN' },
    { ...input, campania_id: '1' },
    { ...input, subcampania_ids: [] },
    { ...input, subcampania_ids: ['11', '11'] },
    { ...input, subcampania_ids: ['9223372036854775808'] },
    { ...input, subcampania_ids: [11] },
    {
      ...input,
      subcampania_ids: Array.from({ length: 101 }, (_, i) => String(i + 1)),
    },
    { ...input, consulta: ' ' },
    { ...input, consulta: 'A' },
    { ...input, limite: '20' },
    { ...input, limite: 21 },
    { ...input, cursor: null },
    { ...input, cursor: 'x'.repeat(1025) },
  ])('rechaza entrada inválida o campos desconocidos %j', (value) => {
    expect(() => parseBuscarPersonas(value)).toThrow(
      UnprocessableEntityException,
    );
  });
  it('valida queries, revisión completa y límites sin coerción del body', () => {
    expect(parseCapacidadesQuery({ limite: '100', campania_id: '7' })).toEqual({
      limite: 100,
      campania_id: '7',
      cursor: null,
    });
    expect(() => parseCapacidadesQuery({ limite: 20 })).toThrow();
    expect(() => parseMiembrosQuery({ contacto: 'si' })).toThrow();
    expect(() =>
      parseRevisarAccesos({
        usuario_destino_id: '2',
        subcampania_ids: ['11'],
        revision: '1',
      }),
    ).toThrow();
  });
});

describe('Lecturas v1: adaptador privado', () => {
  let rpc: jest.Mock;
  let service: ParticipacionLecturasService;
  beforeEach(() => {
    rpc = jest.fn();
    service = new ParticipacionLecturasService(
      { getAdminClient: () => ({ rpc }) } as unknown as SupabaseService,
      { get: () => 'fixture-secret' } as unknown as ConfigService,
    );
  });
  it('distingue capacidades vacías de fallo de infraestructura y relee rol en DB', async () => {
    rpc.mockResolvedValue({
      data: {
        data: {
          actor: { usuario_id: actor.usuario_id, rol_global: 'GENERAL' },
          capacidades_globales: {
            asignar_roles: false,
            designar_administradores: false,
            leer_plan: true,
          },
          subcampanias: [],
        },
        observado_en: observed,
      },
      error: null,
    });
    const result = await service.capacidades(actor, parseCapacidadesQuery({}));
    expect(result.data.actor.rol_global).toBe('GENERAL');
    expect(result.data.subcampanias).toEqual([]);
    expect(result.siguiente_cursor).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      'pa_capacidades_leer',
      expect.objectContaining({
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
      }),
    );
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'sensitive SQL error' },
    });
    await expect(
      service.capacidades(actor, parseCapacidadesQuery({})),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('liga cursor firmado a actor, acción, consulta y selección completa', async () => {
    rpc.mockResolvedValue({
      data: { data: people, observado_en: observed },
      error: null,
    });
    const input = parseBuscarPersonas({
      modo: 'NOMBRE',
      consulta: 'Ana',
      accion: 'OTORGAR_PLANTADOR',
      subcampania_ids: ['11', '12'],
      limite: 1,
    });
    const result = await service.buscar(actor, input);
    expect(result.data).toEqual([people[0]]);
    expect(result.siguiente_cursor).toBeTruthy();
    await service.buscar(actor, {
      ...input,
      cursor: result.siguiente_cursor,
      subcampania_ids: ['12', '11'],
    });
    expect(rpc).toHaveBeenLastCalledWith(
      'pa_personas_buscar',
      expect.objectContaining({ p_despues_id: '2' }),
    );
    for (const changed of [
      { ...input, consulta: 'Anabel' },
      { ...input, accion: 'DESIGNAR_ADMINISTRADOR' as const },
      { ...input, subcampania_ids: ['11'] },
    ]) {
      await expect(
        service.buscar(actor, { ...changed, cursor: result.siguiente_cursor }),
      ).rejects.toThrow(UnprocessableEntityException);
    }
    await expect(
      service.buscar(
        { ...actor, usuario_id: '4' },
        { ...input, cursor: result.siguiente_cursor },
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    const tampered = result.siguiente_cursor!.replace(
      /^./,
      result.siguiente_cursor![0] === 'A' ? 'B' : 'A',
    );
    await expect(
      service.buscar(actor, { ...input, cursor: tampered }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
  it('conserva revisiones retiradas y exige exactamente todos los ámbitos elegidos', async () => {
    const input = parseRevisarAccesos({
      usuario_destino_id: '2',
      subcampania_ids: ['11', '12'],
    });
    const data = {
      usuario: people[0],
      ambitos: [
        {
          subcampania_id: '11',
          permiso_contextual: null,
          revision_permiso: '9007199254740993',
          acceso_global: false,
        },
        {
          subcampania_id: '12',
          permiso_contextual: 'PLANTADOR',
          revision_permiso: '3',
          acceso_global: false,
        },
      ],
    };
    rpc.mockResolvedValue({
      data: { data, observado_en: observed },
      error: null,
    });
    expect((await service.revisar(actor, input)).data).toEqual(data);
    rpc.mockResolvedValue({
      data: {
        data: { ...data, ambitos: [data.ambitos[0], data.ambitos[0]] },
        observado_en: observed,
      },
      error: null,
    });
    await expect(service.revisar(actor, input)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
  it('rechaza respuestas de directorio/contactos o BIGINT numérico', async () => {
    const input = parseBuscarPersonas({
      modo: 'NOMBRE',
      consulta: 'Ana',
      accion: 'OTORGAR_PLANTADOR',
      subcampania_ids: ['11'],
    });
    for (const data of [
      [{ ...people[0], correo: 'privado@test' }],
      [{ ...people[0], usuario_id: 2 }],
      [people[0], people[0]],
      null,
    ]) {
      rpc.mockResolvedValue({
        data: { data, observado_en: observed },
        error: null,
      });
      await expect(service.buscar(actor, input)).rejects.toThrow(
        InternalServerErrorException,
      );
    }
  });
  it('sanitiza errores DB sin revelar SQL o ámbitos ajenos', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PT403',
        message: 'SQL SELECT private-user scope 12',
        details: JSON.stringify({
          codigo: 'CAPACIDAD_INSUFICIENTE',
          mensaje: 'No tiene capacidad para esta operación.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        }),
      },
    });
    try {
      await service.miembros(actor, '11', parseMiembrosQuery({}));
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toEqual({
        error: {
          codigo: 'CAPACIDAD_INSUFICIENTE',
          mensaje: 'No tiene capacidad para esta operación.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        },
        comando_id: null,
        resultado_concluyente: false,
      });
    }
  });
});
