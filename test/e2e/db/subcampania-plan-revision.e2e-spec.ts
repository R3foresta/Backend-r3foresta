// ADR-PLA-05. Nunca usa .env/Supabase compartido: inicia y destruye su propio
// cluster PostgreSQL, con TCP deshabilitado y socket privado en un tempdir.
// Requiere initdb, pg_ctl y psql instalados localmente. Carga las RPC reales
// 054/056 y 060–063 sobre una fixture acotada (GPS fuera del alcance de este ADR).
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const database = 'r3foresta_plan_test';
const repo = resolve(__dirname, '../../..');

type Meta = {
  planta_id: number;
  porcentaje_objetivo: number;
  cantidad_objetivo: number;
};
type Plan = {
  subcampania_id: number;
  estado: string;
  meta_total_arboles: number;
  plan_revision: number;
  metas: Meta[];
};
const meta = (planta: number, cantidad: number, porcentaje = 100): Meta => ({
  planta_id: planta,
  cantidad_objetivo: cantidad,
  porcentaje_objetivo: porcentaje,
});
const literal = (value: unknown) =>
  `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

describe('ADR-PLA-05 — revision atomica del plan en PostgreSQL aislado', () => {
  let directory: string;
  let socket: string;
  let cluster: string;
  let started = false;
  let subId = 100;
  let evidence = 1000;
  const port = '55432';

  async function sql(query: string, applicationName = 'plan_test') {
    try {
      const result = await execute(
        'psql',
        [
          '-X',
          '-qAt',
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          'VERBOSITY=verbose',
          '-h',
          socket,
          '-p',
          port,
          '-d',
          database,
          '-c',
          query,
        ],
        { env: { ...process.env, PGAPPNAME: applicationName }, timeout: 15000 },
      );
      return result.stdout.trim();
    } catch (error) {
      const failure = error as Error & { stderr?: string };
      throw new Error(failure.stderr || failure.message);
    }
  }

  const json = async <T = Record<string, unknown>>(query: string): Promise<T> =>
    JSON.parse(await sql(query)) as T;
  const revisionSql = (
    total: number | null,
    metas: unknown,
    revision: number | null = 0,
    actor = 1,
  ) =>
    `SELECT public.fn_subcampania_revisar_plan(${subId}, ${total ?? 'NULL'}, ${literal(metas)}, ${actor}, ${revision ?? 'NULL'});`;
  const getPlan = () =>
    json<Plan>(`SELECT public.fn_subcampania_obtener_plan(${subId});`);

  async function snapshot() {
    return json(`SELECT jsonb_build_object(
      'sub', (SELECT to_jsonb(s) FROM public.subcampania s WHERE id=${subId}),
      'metas', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.planta_id), '[]') FROM public.subcampania_meta_especie m WHERE subcampania_id=${subId}),
      'historial', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.id), '[]') FROM public.subcampania_historial h WHERE subcampania_id=${subId}),
      'registros', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]') FROM public.registro_plantacion r WHERE subcampania_id=${subId}),
      'detalles', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') FROM public.registro_plantacion_detalle d JOIN public.registro_plantacion r ON r.id=d.registro_plantacion_id WHERE r.subcampania_id=${subId}),
      'asignaciones', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]') FROM public.asignacion_vivero_subcampania a WHERE subcampania_id=${subId}),
      'lotes', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]') FROM public.lote_vivero l WHERE id BETWEEN ${subId * 10} AND ${subId * 10 + 9})
    );`);
  }

  async function assignmentSql(planta: number, cantidad: number) {
    const lotId = subId * 10 + planta;
    const evidenceId = ++evidence;
    await sql(
      `INSERT INTO public.evidencias_trazabilidad(id) VALUES (${evidenceId});`,
    );
    return `SELECT to_jsonb(a) FROM public.fn_vivero_asignar_stock_subcampania(
      ${lotId}, ${subId}, ${cantidad}, 'PLANTACION_INICIAL', 1,
      CURRENT_DATE, ARRAY[${evidenceId}]::bigint[], NULL
    ) a;`;
  }

  async function assign(planta: number, cantidad: number) {
    return json<{ asignacion_id: number }>(
      await assignmentSql(planta, cantidad),
    );
  }

  async function plantingSql(
    asignacion: number,
    planta: number,
    cantidad: number,
    origin: number | null = null,
  ) {
    const evidenceId = ++evidence;
    await sql(
      `INSERT INTO public.evidencias_trazabilidad(id) VALUES (${evidenceId});`,
    );
    return `SELECT to_jsonb(r) FROM public.fn_m3_registrar_plantacion(
      ${subId}, ${origin !== null}, ${origin ?? 'NULL'}, CURRENT_DATE, 1,
      -16.5, -68.1, 'Prueba aislada ADR-PLA-05', ARRAY[]::bigint[],
      ${literal([
        {
          asignacion_id: asignacion,
          lote_vivero_id: subId * 10 + planta,
          planta_id: planta,
          cantidad,
        },
      ])}, ARRAY[${evidenceId}]::bigint[]
    ) r;`;
  }

  const returnSql = (asignacion: number, cantidad: number) =>
    `SELECT to_jsonb(r) FROM public.fn_m3_devolver_asignacion_vivero(
      ${asignacion}, ${cantidad}, 'SOBRANTE_OPERATIVO', 1, CURRENT_DATE, NULL
    ) r;`;

  async function holdTransaction(query: string, name: string) {
    const completion = sql(
      `BEGIN; ${query} SELECT pg_sleep(0.4); COMMIT;`,
      name,
    );
    // Esperar una señal real de pg_stat_activity asegura que el lock ya se
    // obtuvo; no depende de que una pausa arbitraria alcance en la CI.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = await sql(
        `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='${name}' AND wait_event='PgSleep');`,
      );
      if (waiting === 't') return { completion };
      await new Promise((done) => setTimeout(done, 10));
    }
    await completion;
    throw new Error(
      'No se observo la transaccion concurrente sosteniendo el lock.',
    );
  }

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'r3foresta-plan-test-'));
    socket = join(directory, 'socket');
    cluster = join(directory, 'postgres');
    await mkdir(socket);
    await execute(
      'initdb',
      ['-D', cluster, '--auth=trust', '--encoding=UTF8'],
      {
        timeout: 30000,
      },
    );
    await execute(
      'pg_ctl',
      [
        '-D',
        cluster,
        '-l',
        join(directory, 'postgres.log'),
        '-o',
        `-F -h "" -k "${socket}" -p ${port}`,
        '-w',
        'start',
      ],
      { timeout: 30000 },
    );
    started = true;
    await execute('createdb', ['-h', socket, '-p', port, database]);
    const files = [
      'test/e2e/db/fixtures/subcampania-plan.schema.sql',
      'migrations/024_vivero_asignacion_subcampania.sql',
      'migrations/030_m3_registro_plantacion.sql',
      'migrations/047_m3_cancelacion_subcampania_y_plan.sql',
      'migrations/054_m3_devolucion_fisica.sql',
      'migrations/056_fix_devolucion_saldo_constraint.sql',
      'migrations/060_vivero_asignacion_validar_plan_especie.sql',
      'migrations/061_plantacion_meta_especie_orientativa.sql',
      'migrations/062_subcampania_revision_plan_atomica.sql',
      'migrations/063_subcampania_plan_lectura_backend.sql',
    ];
    for (const file of files) {
      await execute('psql', [
        '-X',
        '-q',
        '--single-transaction',
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        socket,
        '-p',
        port,
        '-d',
        database,
        '-f',
        join(repo, file),
      ]);
    }
    await sql(`GRANT USAGE ON SCHEMA public TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
  }, 60000);

  afterAll(async () => {
    if (started)
      await execute('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    subId += 1;
    await sql(`
      INSERT INTO public.subcampania(id, codigo_trazabilidad, meta_total_arboles, created_by, updated_by)
      VALUES (${subId}, 'SUB-TEST-${subId}', 40, 3, 3);
      INSERT INTO public.subcampania_meta_especie(subcampania_id, planta_id, porcentaje_objetivo, cantidad_objetivo, created_by, updated_by)
      VALUES (${subId}, 1, 100, 40, 3, 3);
      INSERT INTO public.subcampania_equipo(subcampania_id, usuario_id, rol)
      VALUES (${subId}, 1, 'OPERARIO'), (${subId}, 2, 'COORDINADOR');
      INSERT INTO public.lote_vivero(id, planta_id, codigo_trazabilidad, saldo_vivo_actual, nombre_cientifico_snapshot, nombre_comercial_snapshot)
      VALUES (${subId * 10 + 1}, 1, 'LOT-${subId}-1', 60, 'Original historica', 'Original'),
             (${subId * 10 + 2}, 2, 'LOT-${subId}-2', 20, 'Nueva historica', 'Nueva');
      INSERT INTO public.evento_lote_vivero(lote_id, tipo_evento, fecha_evento)
      VALUES (${subId * 10 + 1}, 'EMBOLSADO', CURRENT_DATE),
             (${subId * 10 + 2}, 'EMBOLSADO', CURRENT_DATE);
    `);
  });

  it('revisa ACTIVA, audita antes/despues y conserva hechos, autoria y saldos', async () => {
    const assignment = await assign(1, 50);
    await sql(await plantingSql(assignment.asignacion_id, 1, 50));
    const before = await snapshot();
    const previous = await getPlan();
    const result = await json<Plan>(
      revisionSql(60, [meta(1, 30, 50), meta(2, 30, 50)]),
    );

    expect(result).toMatchObject({
      estado: 'ACTIVA',
      meta_total_arboles: 60,
      plan_revision: 1,
    });
    expect(result.metas).toHaveLength(2);
    expect(await getPlan()).toEqual(result);
    const after = await snapshot();
    for (const unchanged of [
      'registros',
      'detalles',
      'asignaciones',
      'lotes',
    ]) {
      expect(after[unchanged]).toEqual(before[unchanged]);
    }
    expect(after.sub).toMatchObject({
      total_plantado_inicial: 50,
      total_repuesto: 0,
      total_muerto_acumulado: 0,
      saldo_vivo_actual: 50,
      estado: 'ACTIVA',
      fecha_cierre_operativo: null,
      created_by: 3,
      updated_by: 1,
    });
    const beforeMeta = (before.metas as Record<string, unknown>[])[0];
    expect((after.metas as Record<string, unknown>[])[0]).toMatchObject({
      id: beforeMeta.id,
      created_at: beforeMeta.created_at,
      created_by: 3,
      updated_by: 1,
    });
    expect(after.historial).toEqual([
      expect.objectContaining({
        tipo_historial: 'PLAN_REVISADO',
        actor_user_id: 1,
        estado_origen: 'ACTIVA',
        estado_destino: 'ACTIVA',
        metadata: { anterior: previous, nuevo: result },
        created_at: (after.sub as Record<string, unknown>).updated_at,
      }),
    ]);
  });

  it('la especie agregada admite asignacion y plantacion por encima de su objetivo orientativo', async () => {
    await expect(sql(await assignmentSql(2, 12))).rejects.toThrow(
      /no esta en el plan/i,
    );
    await sql(revisionSql(50, [meta(1, 40, 80), meta(2, 10, 20)]));
    const assignment = await assign(2, 12);
    const before = await snapshot();
    const eventsBefore = await sql(
      `SELECT COUNT(*) FROM public.evento_lote_vivero WHERE lote_id=${subId * 10 + 2};`,
    );
    const planted = await json<{
      cantidad_total_plantada: number;
      registro_plantacion_id: number;
    }>(await plantingSql(assignment.asignacion_id, 2, 12));
    expect(planted.cantidad_total_plantada).toBe(12);
    const after = await snapshot();
    expect(after.lotes).toEqual(before.lotes);
    expect(
      await sql(
        `SELECT COUNT(*) FROM public.evento_lote_vivero WHERE lote_id=${subId * 10 + 2};`,
      ),
    ).toBe(eventsBefore);
    expect(after.sub).toMatchObject({
      estado: 'ACTIVA',
      total_plantado_inicial: 12,
      meta_total_arboles: 50,
      plan_revision: 1,
    });
    expect((await getPlan()).metas[1]).toMatchObject(meta(2, 10, 20));

    // La revision no amplia el limite duro de reposicion del grupo origen.
    await sql(`UPDATE public.registro_plantacion SET cantidad_muerta_acumulada=3 WHERE id=${planted.registro_plantacion_id};
      INSERT INTO public.asignacion_vivero_subcampania(subcampania_id, lote_vivero_id, cantidad_asignada, proposito, usuario_asignacion_id)
      VALUES (${subId}, ${subId * 10 + 2}, 4, 'REPOSICION', 1);`);
    const replacementId = Number(
      await sql(
        `SELECT MAX(id) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=${subId};`,
      ),
    );
    await expect(
      sql(
        await plantingSql(replacementId, 2, 4, planted.registro_plantacion_id),
      ),
    ).rejects.toThrow(/pendiente de reposicion/i);
  });

  it('conserva el cuerpo legacy BORRADOR {metas} con meta vigente coherente', async () => {
    await sql(
      `UPDATE public.subcampania SET estado='BORRADOR' WHERE id=${subId};`,
    );
    const result = await json<Plan>(revisionSql(null, [meta(2, 40)], null));
    expect(result).toMatchObject({
      estado: 'BORRADOR',
      meta_total_arboles: 40,
      plan_revision: 1,
    });
    expect(result.metas[0]).toMatchObject(meta(2, 40));
  });

  it('una revision completa BORRADOR requiere token y rechaza lecturas obsoletas', async () => {
    await sql(
      `UPDATE public.subcampania SET estado='BORRADOR' WHERE id=${subId};`,
    );
    const before = await snapshot();
    await expect(sql(revisionSql(60, [meta(1, 60)], null))).rejects.toThrow(
      'PT422',
    );
    expect(await snapshot()).toEqual(before);
    await sql(revisionSql(60, [meta(1, 60)]));
    const current = await snapshot();
    await expect(sql(revisionSql(80, [meta(1, 80)], 0))).rejects.toThrow(
      'PT409',
    );
    expect(await snapshot()).toEqual(current);
  });

  it('un ID inexistente produce snapshot null y error PT404 al revisar', async () => {
    expect(
      await sql('SELECT public.fn_subcampania_obtener_plan(999999) IS NULL;'),
    ).toBe('t');
    await expect(
      sql(
        `SELECT public.fn_subcampania_revisar_plan(999999, 40, ${literal([meta(1, 40)])}, 1, 0);`,
      ),
    ).rejects.toThrow('PT404');
  });

  it('rechaza coordinador contextual sin ADMIN global y actor inexistente', async () => {
    const before = await snapshot();
    for (const actor of [2, 999]) {
      await expect(
        sql(revisionSql(40, [meta(1, 40)], 0, actor)),
      ).rejects.toThrow('PT403');
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each(['COMPLETADA', 'FINALIZADA_PARCIAL', 'PAUSADA', 'CANCELADA'])(
    'rechaza %s sin reabrir',
    async (estado) => {
      await sql(
        `UPDATE public.subcampania SET estado='${estado}' WHERE id=${subId};`,
      );
      if (estado === 'CANCELADA') {
        await sql(
          `UPDATE public.subcampania SET deleted_at=NOW(), deleted_by=1 WHERE id=${subId};`,
        );
      }
      const before = await snapshot();
      await expect(sql(revisionSql(40, [meta(1, 40)]))).rejects.toThrow(
        'PT422',
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each([
    { nombre: 'sin meta total', total: null, metas: [meta(1, 40)], version: 0 },
    {
      nombre: 'sin revision esperada',
      total: 40,
      metas: [meta(1, 40)],
      version: null,
    },
    { nombre: 'meta total cero', total: 0, metas: [meta(1, 40)], version: 0 },
    { nombre: 'plan vacio', total: 40, metas: [], version: 0 },
    { nombre: 'plan no array', total: 40, metas: {}, version: 0 },
    {
      nombre: 'especie duplicada',
      total: 40,
      metas: [meta(1, 20, 50), meta(1, 20, 50)],
      version: 0,
    },
    { nombre: 'cantidad cero', total: 40, metas: [meta(1, 0)], version: 0 },
    {
      nombre: 'cantidad fraccionaria',
      total: 40,
      metas: [meta(1, 40.5)],
      version: 0,
    },
    {
      nombre: 'porcentaje cero',
      total: 40,
      metas: [meta(1, 40, 0)],
      version: 0,
    },
    {
      nombre: 'porcentaje fuera de rango',
      total: 40,
      metas: [meta(1, 40, 101)],
      version: 0,
    },
    {
      nombre: 'porcentaje precision excesiva',
      total: 40,
      metas: [meta(1, 20, 33.333), meta(2, 20, 66.667)],
      version: 0,
    },
    {
      nombre: 'total incoherente',
      total: 41,
      metas: [meta(1, 40)],
      version: 0,
    },
    {
      nombre: 'porcentajes no 100',
      total: 40,
      metas: [meta(1, 40, 99)],
      version: 0,
    },
    {
      nombre: 'planta id invalido',
      total: 40,
      metas: [meta(0, 40)],
      version: 0,
    },
  ])(
    'rechaza $nombre sin modificar nada',
    async ({ total, metas, version }) => {
      const before = await snapshot();
      await expect(sql(revisionSql(total, metas, version))).rejects.toThrow(
        'PT422',
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('rechaza especie ausente del catalogo sin borrar el plan previo', async () => {
    const before = await snapshot();
    await expect(sql(revisionSql(40, [meta(999, 40)]))).rejects.toThrow(
      '23503',
    );
    expect(await snapshot()).toEqual(before);
  });

  it.each(['stock', 'plantacion'])(
    'protege retiro con %s inicial, conserva todo',
    async (uso) => {
      const assignment = await assign(1, 10);
      if (uso === 'plantacion')
        await sql(await plantingSql(assignment.asignacion_id, 1, 10));
      const before = await snapshot();
      await expect(sql(revisionSql(40, [meta(2, 40)]))).rejects.toThrow(
        uso === 'plantacion'
          ? /plantacion inicial registrada/i
          : /stock disponible/i,
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('permite retirar especie sin plantacion inicial aunque tenga stock de REPOSICION', async () => {
    await sql(`INSERT INTO public.asignacion_vivero_subcampania(subcampania_id, lote_vivero_id, cantidad_asignada, proposito, usuario_asignacion_id)
      VALUES (${subId}, ${subId * 10 + 1}, 5, 'REPOSICION', 1);`);
    const before = await snapshot();
    const result = await json<Plan>(revisionSql(40, [meta(2, 40)]));
    expect(result.metas[0]).toMatchObject(meta(2, 40));
    const after = await snapshot();
    expect(after.asignaciones).toEqual(before.asignaciones);
    expect(after.lotes).toEqual(before.lotes);
  });

  it.each([
    { caso: 'retiro e incorporacion', metas: [meta(2, 60)] },
    {
      caso: 'ajuste e incorporacion',
      metas: [meta(1, 30, 50), meta(2, 30, 50)],
    },
  ])(
    'fallo del historial revierte $caso, total, revision y autores',
    async ({ metas }) => {
      const before = await snapshot();
      await sql(`CREATE FUNCTION public.test_fail_plan_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.subcampania_id=${subId} THEN RAISE EXCEPTION 'Fallo de auditoria inyectado'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_plan_audit BEFORE INSERT ON public.subcampania_historial
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_plan_audit();`);
      try {
        await expect(sql(revisionSql(60, metas))).rejects.toThrow(
          'Fallo de auditoria inyectado',
        );
        expect(await snapshot()).toEqual(before);
      } finally {
        await sql(
          'DROP TRIGGER test_fail_plan_audit ON public.subcampania_historial; DROP FUNCTION public.test_fail_plan_audit();',
        );
      }
    },
  );

  it('dos revisiones concurrentes desde version 0 producen una sola escritura/auditoria', async () => {
    const results = await Promise.allSettled([
      sql(revisionSql(60, [meta(1, 60)])),
      sql(revisionSql(80, [meta(1, 80)])),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain('PT409');
    const result = await getPlan();
    expect(result.plan_revision).toBe(1);
    expect(result.metas[0].cantidad_objetivo).toBe(result.meta_total_arboles);
    expect(
      await sql(
        `SELECT COUNT(*) FROM public.subcampania_historial WHERE subcampania_id=${subId};`,
      ),
    ).toBe('1');
  });

  it('asignacion bloqueada detras de una revision usa la nueva pertenencia de especies', async () => {
    const assignment = await assignmentSql(1, 5);
    const { completion } = await holdTransaction(
      revisionSql(40, [meta(2, 40)]),
      `revision_${subId}`,
    );
    const result = await Promise.allSettled([completion, sql(assignment)]);
    expect(result[0].status).toBe('fulfilled');
    expect(result[1].status).toBe('rejected');
    expect(String((result[1] as PromiseRejectedResult).reason)).toMatch(
      /no esta en el plan/i,
    );
    expect(
      await sql(
        `SELECT COUNT(*) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=${subId};`,
      ),
    ).toBe('0');
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 1};`,
      ),
    ).toBe('60');
  });

  it('revision que espera una asignacion detecta el stock recien entregado y rechaza retiro', async () => {
    const { completion } = await holdTransaction(
      await assignmentSql(1, 5),
      `assignment_${subId}`,
    );
    const result = await Promise.allSettled([
      completion,
      sql(revisionSql(40, [meta(2, 40)])),
    ]);
    expect(result[0].status).toBe('fulfilled');
    expect(String((result[1] as PromiseRejectedResult).reason)).toMatch(
      /stock disponible/i,
    );
    expect((await getPlan()).plan_revision).toBe(0);
  });

  it('revision que espera una plantacion detecta el registro aun con stock inicial agotado', async () => {
    const assignment = await assign(1, 5);
    const { completion } = await holdTransaction(
      await plantingSql(assignment.asignacion_id, 1, 5),
      `planting_${subId}`,
    );
    const result = await Promise.allSettled([
      completion,
      sql(revisionSql(40, [meta(2, 40)])),
    ]);
    expect(result[0].status).toBe('fulfilled');
    expect(String((result[1] as PromiseRejectedResult).reason)).toMatch(
      /plantacion inicial registrada/i,
    );
    expect((await getPlan()).plan_revision).toBe(0);
    expect(
      await sql(
        `SELECT total_plantado_inicial FROM public.subcampania WHERE id=${subId};`,
      ),
    ).toBe('5');
  });

  it('una lectura durante una revisión sin commit conserva el snapshot anterior completo', async () => {
    const before = await getPlan();
    const { completion } = await holdTransaction(
      revisionSql(60, [meta(1, 30, 50), meta(2, 30, 50)]),
      `snapshot_${subId}`,
    );
    try {
      expect(await getPlan()).toEqual(before);
    } finally {
      await completion;
    }
    const after = await getPlan();
    expect(after).toMatchObject({ meta_total_arboles: 60, plan_revision: 1 });
    expect(
      after.metas.map(({ cantidad_objetivo }) => cantidad_objetivo),
    ).toEqual([30, 30]);
  });

  it('asigna una especie nueva esperando el commit de su incorporación al plan', async () => {
    const assignment = await assignmentSql(2, 5);
    const { completion } = await holdTransaction(
      revisionSql(40, [meta(1, 20, 50), meta(2, 20, 50)]),
      `add_species_${subId}`,
    );
    const results = await Promise.allSettled([completion, json(assignment)]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 2};`,
      ),
    ).toBe('15');
    expect(
      await sql(
        `SELECT SUM(saldo_asignado_disponible) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=${subId};`,
      ),
    ).toBe('5');
    expect((await getPlan()).plan_revision).toBe(1);
  });

  it('plantación detrás de una revisión admite superar la nueva meta y conserva stock físico', async () => {
    const assignment = await assign(1, 10);
    const planting = await plantingSql(assignment.asignacion_id, 1, 10);
    const { completion } = await holdTransaction(
      revisionSql(5, [meta(1, 5)]),
      `lower_goal_${subId}`,
    );
    const results = await Promise.allSettled([completion, json(planting)]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await sql(
        `SELECT total_plantado_inicial FROM public.subcampania WHERE id=${subId};`,
      ),
    ).toBe('10');
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 1};`,
      ),
    ).toBe('50');
    expect((await getPlan()).meta_total_arboles).toBe(5);
  });

  it('una devolución completa permite retirar la especie sin perder stock ni su historial físico', async () => {
    const assignment = await assign(1, 10);
    await sql(returnSql(assignment.asignacion_id, 10));
    const before = await snapshot();
    await sql(revisionSql(40, [meta(2, 40)]));
    const after = await snapshot();
    expect(after.asignaciones).toEqual(before.asignaciones);
    expect(after.lotes).toEqual(before.lotes);
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 1};`,
      ),
    ).toBe('60');
    expect(
      await sql(
        `SELECT COUNT(*) FROM public.evento_lote_vivero WHERE asignacion_id=${assignment.asignacion_id} AND tipo_evento='DEVOLUCION_PLANTACION';`,
      ),
    ).toBe('1');
    expect((await getPlan()).metas[0].planta_id).toBe(2);
  });

  it('una devolución parcial mantiene protegida la especie con saldo inicial restante', async () => {
    const assignment = await assign(1, 10);
    await sql(returnSql(assignment.asignacion_id, 4));
    const before = await snapshot();
    await expect(sql(revisionSql(40, [meta(2, 40)]))).rejects.toThrow(
      /stock disponible/i,
    );
    expect(await snapshot()).toEqual(before);
    expect(
      await sql(
        `SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id=${assignment.asignacion_id};`,
      ),
    ).toBe('6');
  });

  it('no retira una especie apoyándose en una devolución todavía sin commit', async () => {
    const assignment = await assign(1, 10);
    const { completion } = await holdTransaction(
      returnSql(assignment.asignacion_id, 10),
      `return_${subId}`,
    );
    const results = await Promise.allSettled([
      completion,
      sql(revisionSql(40, [meta(2, 40)])),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(
      /stock disponible/i,
    );
    expect((await getPlan()).plan_revision).toBe(0);
    await sql(revisionSql(40, [meta(2, 40)]));
    expect((await getPlan()).plan_revision).toBe(1);
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 1};`,
      ),
    ).toBe('60');
  });

  it('devolución y ajuste concurrentes conservan cantidades físicas y una sola auditoría del plan', async () => {
    const assignment = await assign(1, 10);
    const { completion } = await holdTransaction(
      revisionSql(60, [meta(1, 60)]),
      `revision_return_${subId}`,
    );
    const results = await Promise.allSettled([
      completion,
      sql(returnSql(assignment.asignacion_id, 10)),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await sql(
        `SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=${subId * 10 + 1};`,
      ),
    ).toBe('60');
    expect(
      await sql(
        `SELECT cantidad_devuelta FROM public.asignacion_vivero_subcampania WHERE id=${assignment.asignacion_id};`,
      ),
    ).toBe('10');
    expect(
      await sql(
        `SELECT COUNT(*) FROM public.subcampania_historial WHERE subcampania_id=${subId} AND tipo_historial='PLAN_REVISADO';`,
      ),
    ).toBe('1');
    expect((await getPlan()).plan_revision).toBe(1);
  });

  it('063 obliga a consultar el snapshot mediante el backend y conserva los datos', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(
        await sql(
          `SELECT has_function_privilege('${role}', 'public.fn_subcampania_obtener_plan(bigint)', 'EXECUTE');`,
        ),
      ).toBe('f');
      await expect(
        sql(
          `SET ROLE ${role}; SELECT public.fn_subcampania_obtener_plan(${subId});`,
        ),
      ).rejects.toThrow(/permission denied for function/i);
    }
    const result = await json<Plan>(
      `SET ROLE service_role; SELECT public.fn_subcampania_obtener_plan(${subId});`,
    );
    expect(result).toEqual(await getPlan());
  });

  it('reaplicar 063 conserva datos, historial y permisos del snapshot', async () => {
    await sql(revisionSql(60, [meta(1, 60)]));
    const before = await snapshot();
    await execute('psql', [
      '-X',
      '-q',
      '--single-transaction',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-p',
      port,
      '-d',
      database,
      '-f',
      join(repo, 'migrations/063_subcampania_plan_lectura_backend.sql'),
    ]);
    expect(await snapshot()).toEqual(before);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(
        await sql(
          `SELECT has_function_privilege('${role}', 'public.fn_subcampania_obtener_plan(bigint)', 'EXECUTE');`,
        ),
      ).toBe(role === 'service_role' ? 't' : 'f');
    }
  });

  it('el diagnóstico manual es SQL válido de solo lectura y conserva el snapshot', async () => {
    const before = await snapshot();
    await execute('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-p',
      port,
      '-d',
      database,
      '-f',
      join(repo, 'documentacion/sql/verificar_subcampania_plan_062_063.sql'),
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('restringe la RPC de revision al backend service_role', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(
        await sql(
          `SELECT has_function_privilege('${role}', 'public.fn_subcampania_revisar_plan(bigint,integer,jsonb,bigint,bigint)', 'EXECUTE');`,
        ),
      ).toBe('f');
      await expect(
        sql(`SET ROLE ${role}; ${revisionSql(60, [meta(1, 60)])}`),
      ).rejects.toThrow(/permission denied for function/i);
    }
    expect(
      await sql(
        "SELECT has_function_privilege('service_role', 'public.fn_subcampania_revisar_plan(bigint,integer,jsonb,bigint,bigint)', 'EXECUTE');",
      ),
    ).toBe('t');
    const result = await json<Plan>(
      `SET ROLE service_role; ${revisionSql(60, [meta(1, 60)])}`,
    );
    expect(result).toMatchObject({ meta_total_arboles: 60, plan_revision: 1 });
  });
  it('reaplicar 062 en una transaccion conserva la revision y todo su historial', async () => {
    await sql(revisionSql(60, [meta(1, 60)]));
    const before = await snapshot();
    await execute('psql', [
      '-X',
      '-q',
      '--single-transaction',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-p',
      port,
      '-d',
      database,
      '-f',
      join(repo, 'migrations/062_subcampania_revision_plan_atomica.sql'),
    ]);
    expect(await snapshot()).toEqual(before);
    const result = await json<Plan>(revisionSql(80, [meta(1, 80)], 1));
    expect(result.plan_revision).toBe(2);
    expect(result.meta_total_arboles).toBe(80);
  });
});
