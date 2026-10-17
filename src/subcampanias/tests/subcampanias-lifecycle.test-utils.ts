import { ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';

export function lifecycleFixture(
  data: unknown,
  error: { code?: string; message?: string } | null = null,
  rol = 'ADMIN',
) {
  const rpc = jest.fn().mockResolvedValue({ data, error });
  const from = jest.fn(() => {
    throw new Error('No se permiten escrituras por fuera de la RPC.');
  });
  const supabase = {
    getAdminClient: jest.fn(() => ({ rpc, from })),
  } as unknown as SupabaseService;
  const auth = {
    getUserByAuthId: jest.fn().mockResolvedValue({ id: 99, rol }),
    assertAdmin: jest.fn((value: string) => {
      if (value !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
  return { supabase, auth, rpc, from };
}
