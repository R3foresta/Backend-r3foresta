import { SupabaseService } from '../supabase/supabase.service';
import { UbicacionesReadService } from '../common/ubicaciones/ubicaciones-read.service';
import { ViverosService } from './viveros.service';

describe('Catálogo público de viveros para T3', () => {
  it('solicita IDs de texto antes de deserializar los viveros BIGINT vecinos', async () => {
    const rows = ['9007199254740992', '9007199254740993'].map(id => ({ id, codigo: `S-${id}`, nombre: 'Vivero sintético', ubicacion_id: null }));
    const select = jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) });
    const supabase = { getClient: () => ({ from: () => ({ select }) }) } as unknown as SupabaseService;
    const ubicaciones = { getUbicacionesByIds: jest.fn().mockResolvedValue(new Map()) } as unknown as UbicacionesReadService;
    const result = await new ViverosService(supabase, ubicaciones).findAll();
    expect(select).toHaveBeenCalledWith(expect.stringContaining('id::text'));
    expect(result.data.map(item => item.id)).toEqual(rows.map(item => item.id));
  });
});
