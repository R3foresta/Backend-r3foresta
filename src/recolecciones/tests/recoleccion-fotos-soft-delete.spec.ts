import { Logger, NotFoundException } from '@nestjs/common';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionSnapshotsService } from '../application/recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';

// Caso de uso y servicios de fotos/lectura reales; DB y Storage sustituidos.
// El bloqueo real del INSERT se verifica en el runner PostgreSQL 089.
describe('PATCH solo fotos frente a DELETE de borrador', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['DELETE primero', 'foto primero'] as const)(
    '%s: respeta el resultado confirmado sin dejar vínculos posteriores al borrado',
    async (orden) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const state = { deleted: false, evidence: 0, uploads: new Set<string>() };
      const remove = jest.fn(async (paths: string[]) => {
        paths.forEach((path) => state.uploads.delete(path));
        return { data: [], error: null };
      });
      const update = jest.fn();
      const insert = jest.fn(() => {
        if (state.deleted)
          return {
            data: null,
            error: { code: 'P0002' },
            status: 404,
          };
        state.evidence++;
        state.deleted = true;
        return { data: [{ id: 501 }], error: null, status: 201 };
      });
      const row = {
        id: 292,
        usuario_id: 7,
        estado_registro: 'BORRADOR',
        codigo_trazabilidad: 'REC-FIXTURE',
      };
      const client = {
        rpc: async (_name: string, args: any) => {
          const result = insert();
          return result.error
            ? result
            : {
                data: { id: args.p_recoleccion_id, evidencia_ids: [501] },
                error: null,
              };
        },
        from(table: string) {
          let activeOnly = false,
            inserting = false;
          const result = () => {
            if (table === 'recoleccion')
              return {
                data: state.deleted && activeOnly ? null : { ...row },
                error: null,
              };
            if (table === 'tipos_entidad_evidencia')
              return { data: { id: 1, activo: true }, error: null };
            return inserting ? insert() : { data: [], error: null, count: 0 };
          };
          const query = {
            select: () => query,
            eq: () => query,
            ilike: () => query,
            is: () => {
              activeOnly = true;
              return query;
            },
            insert: () => {
              inserting = true;
              return query;
            },
            update,
            single: async () => result(),
            maybeSingle: async () => result(),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(result()).then(resolve),
          };
          return query;
        },
        storage: {
          from: () => ({
            upload: async (path: string) => {
              state.uploads.add(path);
              if (orden === 'DELETE primero') state.deleted = true;
              return { data: { id: 'storage-fixture' }, error: null };
            },
            remove,
          }),
        },
      };
      const supabase = {
        getClient: () => client,
        getAdminClient: () => client,
      } as unknown as SupabaseService;
      const evidence = new RecoleccionEvidenciasService(
        supabase,
        new EvidenceFileService(),
      );
      const auth = {
        getUserByAuthId: async () => ({ id: 7, rol: 'GENERAL' }),
        assertOwnerOrAdmin() {},
      } as unknown as RecoleccionAuthService;
      const reads = new RecoleccionConsultasService(
        supabase,
        auth,
        {} as RecoleccionUbicacionService,
        evidence,
        {} as never,
      );
      const service = new RecoleccionDraftService(
        supabase,
        auth,
        reads,
        evidence,
        {} as RecoleccionSnapshotsService,
        {} as RecoleccionUbicacionService,
      );

      await expect(
        service.updateDraft(292, {}, 'fixture', 'GENERAL', [
          {
            originalname: 'foto.jpg',
            mimetype: 'image/jpeg',
            buffer: Buffer.from('foto sintética'),
          },
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(insert).toHaveBeenCalledTimes(1);
      expect(state.evidence).toBe(orden === 'DELETE primero' ? 0 : 1);
      expect(state.uploads.size).toBe(orden === 'DELETE primero' ? 0 : 1);
      expect(remove).toHaveBeenCalledTimes(orden === 'DELETE primero' ? 1 : 0);
    },
  );
});
