import {
  expectedWebAuthnOrigin,
  isCorsOriginAllowed,
  loadTrustedOrigins,
} from './trusted-origins';

describe('orígenes de confianza CORS/WebAuthn', () => {
  it('define sólo los tres orígenes locales cuando desarrollo carece de configuración', () => {
    expect(loadTrustedOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
    ]);
  });

  it('producción requiere una lista explícita y usa cada origen exacto', () => {
    expect(() => loadTrustedOrigins({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS es obligatorio en producción.',
    );
    const origins = loadTrustedOrigins({
      NODE_ENV: 'production',
      CORS_ORIGINS:
        'https://pwa-r3foresta.vercel.app, https://admin.example.invalid',
    });
    expect(origins).toEqual([
      'https://pwa-r3foresta.vercel.app',
      'https://admin.example.invalid',
    ]);
    expect(isCorsOriginAllowed(origins, origins[0])).toBe(true);
    expect(isCorsOriginAllowed(origins, 'https://arbitrario.vercel.app')).toBe(
      false,
    );
    expect(isCorsOriginAllowed(origins, 'http://localhost:5173')).toBe(false);
  });

  it('una configuración de desarrollo también reemplaza la lista local', () => {
    const origins = loadTrustedOrigins({
      NODE_ENV: 'development',
      CORS_ORIGINS: 'http://localhost:4200',
    });
    expect(origins).toEqual(['http://localhost:4200']);
    expect(isCorsOriginAllowed(origins, 'http://localhost:5173')).toBe(false);
  });

  it.each([
    '',
    'null',
    '*',
    'https://*.vercel.app',
    'https://app.example.invalid/',
    'https://app.example.invalid/login',
    'https://user:pass@app.example.invalid',
    'https://app.example.invalid?x=1',
    'https://app.example.invalid#fragmento',
    'https://app.example.invalid,',
    'http://localhost:5173',
    'http://app.example.invalid',
  ])('rechaza configuración de producción ambigua o insegura %s', (value) => {
    expect(() =>
      loadTrustedOrigins({ NODE_ENV: 'production', CORS_ORIGINS: value }),
    ).toThrow('CORS_ORIGINS');
  });

  it('permite ausencia de Origin sólo para el CORS HTTP general', () => {
    const origins = ['https://app.example.invalid'];
    expect(isCorsOriginAllowed(origins, undefined)).toBe(true);
    expect(isCorsOriginAllowed(origins, 'null')).toBe(false);
    expect(isCorsOriginAllowed(origins, '')).toBe(false);
    expect(() => expectedWebAuthnOrigin(origins, undefined)).toThrow(
      'Origen WebAuthn no permitido.',
    );
    expect(expectedWebAuthnOrigin(origins, origins[0])).toBe(origins[0]);
  });
});
