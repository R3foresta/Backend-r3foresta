const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];

/** Lista completa compartida por CORS y la verificación WebAuthn. */
export function loadTrustedOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const production = environment.NODE_ENV === 'production';
  const configured = environment.CORS_ORIGINS;
  if (configured === undefined) {
    if (production) {
      throw new Error('CORS_ORIGINS es obligatorio en producción.');
    }
    return [...developmentOrigins];
  }

  const origins = configured.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS contiene un origen inválido.');
    }
    const localHttp =
      !production &&
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      origin !== parsed.origin ||
      origin.includes('*') ||
      (parsed.protocol !== 'https:' && !localHttp)
    ) {
      throw new Error(
        'CORS_ORIGINS requiere orígenes HTTPS exactos; HTTP local se admite en desarrollo.',
      );
    }
  }
  return [...new Set(origins)];
}

export function expectedWebAuthnOrigin(
  trustedOrigins: readonly string[],
  requestOrigin: string | undefined,
): string {
  const expected = trustedOrigins.find((origin) => origin === requestOrigin);
  if (!expected) throw new Error('Origen WebAuthn no permitido.');
  return expected;
}

export function isCorsOriginAllowed(
  trustedOrigins: readonly string[],
  requestOrigin: string | undefined,
): boolean {
  return requestOrigin === undefined || trustedOrigins.includes(requestOrigin);
}
