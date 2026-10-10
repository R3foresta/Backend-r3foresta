import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('SupabaseService — cliente administrativo', () => {
  beforeEach(() => jest.mocked(createClient).mockReset());

  function initialize(serviceKey?: string) {
    const values: Record<string, string | undefined> = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'public-test-key',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    };
    const config = { get: (name: string) => values[name] } as ConfigService;
    const service = new SupabaseService(config);
    service.onModuleInit();
    return service;
  }

  it.each([undefined, '', '   '])(
    'rechaza operaciones administrativas sin service_role (%s) y mantiene el cliente normal',
    (key) => {
      const client = {} as ReturnType<typeof createClient>;
      jest.mocked(createClient).mockReturnValue(client);
      const service = initialize(key);
      expect(service.getClient()).toBe(client);
      expect(() => service.getAdminClient()).toThrow(
        InternalServerErrorException,
      );
      expect(() => service.getAdminClient()).toThrow(
        'SUPABASE_SERVICE_ROLE_KEY',
      );
      expect(createClient).toHaveBeenCalledTimes(1);
    },
  );

  it('usa exclusivamente la clave configurada para el cliente administrativo', () => {
    const client = {} as ReturnType<typeof createClient>;
    const admin = {} as ReturnType<typeof createClient>;
    jest
      .mocked(createClient)
      .mockReturnValueOnce(client)
      .mockReturnValueOnce(admin);
    const service = initialize('service-test-key');
    expect(service.getAdminClient()).toBe(admin);
    expect(service.getAdminClient()).not.toBe(service.getClient());
    expect(createClient).toHaveBeenNthCalledWith(
      2,
      'https://example.supabase.co',
      'service-test-key',
    );
  });
});
