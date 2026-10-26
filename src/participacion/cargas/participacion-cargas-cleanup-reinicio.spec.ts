import type { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionCargasService } from './participacion-cargas.service';
import type { ParticipacionImagenService } from './participacion-imagen.service';

describe('ParticipacionCargasService: recuperación de limpieza', () => {
  it('reintenta tras fallo y reinicio sólo con el barrido habilitado; revisita borrados verificados', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFlag = process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED;
    const row = {
      carga_interna_id: '123',
      generacion: 1,
      bucket: 'participacion_evidencias',
      ruta_original: 'actor/comando/carga/1/original',
      ruta_derivada: 'actor/comando/carga/1/derivada.jpg',
    };
    const paths = [row.ruta_original, row.ruta_derivada];
    const objects = new Set(paths);
    let failRemove = true;
    let due = true;
    let cleanupState: 'PENDIENTE' | 'BORRADO_VERIFICADO' = 'PENDIENTE';
    const results: boolean[] = [];
    const bucket = {
      remove: jest.fn((requested: string[]) => {
        if (failRemove) {
          failRemove = false;
          return Promise.resolve({
            error: new Error('fallo temporal de Storage'),
          });
        }
        requested.forEach((path) => objects.delete(path));
        return Promise.resolve({ error: null });
      }),
      download: jest.fn((path: string) =>
        Promise.resolve(
          objects.has(path)
            ? { data: new Blob(['foto']), error: null }
            : { data: null, error: { statusCode: '404' } },
        ),
      ),
    };
    const rpc = jest.fn(
      (
        _name: string,
        args: { p_accion: string; p_payload?: { borrado?: boolean } },
      ) => {
        if (args.p_accion === 'EXPIRAR')
          return Promise.resolve({ data: false, error: null });
        if (args.p_accion === 'LISTAR')
          return Promise.resolve({ data: due ? [row] : [], error: null });
        if (args.p_accion === 'RESULTADO') {
          const borrado = args.p_payload?.borrado === true;
          results.push(borrado);
          cleanupState = borrado ? 'BORRADO_VERIFICADO' : 'PENDIENTE';
          due = false; // El ledger aplaza el siguiente intento cinco minutos.
          return Promise.resolve({ data: [], error: null });
        }
        throw new Error('RPC inesperada');
      },
    );
    const supabase = {
      getAdminClient: () => ({ rpc, storage: { from: () => bucket } }),
    } as unknown as SupabaseService;
    const nuevo = () =>
      new ParticipacionCargasService(
        supabase,
        {} as ParticipacionImagenService,
      );

    jest.useFakeTimers();
    let first: ParticipacionCargasService | undefined;
    let disabled: ParticipacionCargasService | undefined;
    let restarted: ParticipacionCargasService | undefined;
    try {
      process.env.NODE_ENV = 'development';
      process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED = 'true';
      first = nuevo();
      first.onModuleInit();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(results).toEqual([false]);
      expect(cleanupState).toBe('PENDIENTE');
      expect(objects.size).toBe(2);
      first.onModuleDestroy();

      // Un proceso reiniciado sin flag conserva la obligación en DB y los objetos.
      process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED = 'false';
      disabled = nuevo();
      disabled.onModuleInit();
      due = true;
      await jest.advanceTimersByTimeAsync(60_000);
      expect(results).toEqual([false]);
      expect(objects.size).toBe(2);
      disabled.onModuleDestroy();

      process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED = 'true';
      restarted = nuevo();
      restarted.onModuleInit();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(bucket.remove).toHaveBeenLastCalledWith(paths);
      expect(results).toEqual([false, true]);
      expect(cleanupState).toBe('BORRADO_VERIFICADO');
      expect(objects.size).toBe(0);

      // Una subida atrasada puede reaparecer tras la primera verificación.
      paths.forEach((path) => objects.add(path));
      due = true;
      await jest.advanceTimersByTimeAsync(60_000);
      expect(results).toEqual([false, true, true]);
      expect(objects.size).toBe(0);
    } finally {
      first?.onModuleDestroy();
      disabled?.onModuleDestroy();
      restarted?.onModuleDestroy();
      jest.useRealTimers();
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalFlag === undefined)
        delete process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED;
      else process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED = originalFlag;
    }
  });
});
