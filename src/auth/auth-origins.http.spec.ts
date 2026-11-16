import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { createHash, generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PerfilV1Service } from '../users/perfil-v1.service';

// Biblioteca WebAuthn real con credencial/firma sintéticas; RPC privada sustituida.
describe('registro/login HTTP con orígenes de confianza', () => {
  const origin = 'https://pwa-r3foresta.vercel.app';
  const secondOrigin = 'https://admin.example.invalid';
  const originalConfig = process.env.CORS_ORIGINS;
  let app: INestApplication<Server>;
  let httpServer: Server;
  let auth: AuthService;
  let users: UsersService;
  let jwt: JwtService;
  let privateKey: KeyObject;
  let publicKey: string;
  let rpc: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  let findCredential: jest.SpiedFunction<UsersService['findByCredentialId']>;
  let updateCounter: jest.SpiedFunction<
    UsersService['updateCredentialCounter']
  >;

  function clientData(type: string, challenge: string, ceremonyOrigin: string) {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: ceremonyOrigin,
        crossOrigin: false,
      }),
    );
  }

  function authenticatorData(ceremonyOrigin: string, registration: boolean) {
    const data = Buffer.alloc(registration ? 55 : 37);
    createHash('sha256')
      .update(new URL(ceremonyOrigin).hostname)
      .digest()
      .copy(data);
    data[32] = registration ? 0x45 : 0x05;
    data.writeUInt32BE(registration ? 0 : 1, 33);
    return data;
  }

  function signup(challenge: string, ceremonyOrigin = origin) {
    return {
      username: ' Ana ',
      challenge,
      registration: {
        id: 'Y3JlZGVuY2lhbC1zaW50ZXRpY2E',
        type: 'public-key',
        response: {
          clientDataJSON: clientData(
            'webauthn.create',
            challenge,
            ceremonyOrigin,
          ).toString('base64url'),
          authenticatorData: authenticatorData(ceremonyOrigin, true).toString(
            'base64url',
          ),
          publicKey,
          publicKeyAlgorithm: -257,
          transports: ['internal'],
        },
        user: { id: 'sintetico', name: 'Ana', displayName: 'Ana' },
      },
    };
  }

  function login(challenge: string, ceremonyOrigin = origin) {
    const data = clientData('webauthn.get', challenge, ceremonyOrigin);
    const authenticator = authenticatorData(ceremonyOrigin, false);
    const signed = Buffer.concat([
      authenticator,
      createHash('sha256').update(data).digest(),
    ]);
    return {
      challenge,
      authentication: {
        id: 'Y3JlZGVuY2lhbC1zaW50ZXRpY2E',
        credentialId: 'Y3JlZGVuY2lhbC1zaW50ZXRpY2E',
        response: {
          clientDataJSON: data.toString('base64url'),
          authenticatorData: authenticator.toString('base64url'),
          signature: sign('sha256', signed, privateKey).toString('base64url'),
        },
      },
    };
  }

  beforeAll(async () => {
    process.env.CORS_ORIGINS = `${origin},${secondOrigin}`;
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64url');
    jwt = new JwtService({ secret: 'jwt-sintetico-solo-pruebas-locales' });
    rpc = jest
      .fn<Promise<unknown>, [string, Record<string, unknown>]>()
      .mockImplementation((_name, args) =>
        Promise.resolve({
          data: {
            usuario_id: '9007199254740993',
            auth_id: args.p_auth_id,
            username: args.p_username,
            correo: args.p_correo,
            created_at: '2026-11-16T00:00:00Z',
          },
          error: null,
        }),
      );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        UsersService,
        { provide: JwtService, useValue: jwt },
        { provide: PerfilV1Service, useValue: {} },
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer();
    auth = module.get(AuthService);
    users = module.get(UsersService);
    findCredential = jest.spyOn(users, 'findByCredentialId').mockResolvedValue({
      user: {
        id: 'cuenta-legada',
        username: 'Ana',
        credentials: [],
        createdAt: new Date(),
      },
      credential: {
        credentialId: 'Y3JlZGVuY2lhbC1zaW50ZXRpY2E',
        publicKey,
        algorithm: 'RS256',
        counter: 0,
        createdAt: new Date(),
      },
    });
    updateCounter = jest
      .spyOn(users, 'updateCredentialCounter')
      .mockResolvedValue();
    jest.spyOn(users, 'updateLastLogin').mockResolvedValue();
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app?.close();
    if (originalConfig === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalConfig;
  });

  it.each([origin, secondOrigin])(
    'acepta alta con ceremonia del origen %s',
    async (trusted) => {
      const challenge = auth.generateChallenge().challenge;
      const response = await request(httpServer)
        .post('/api/auth/register')
        .set('Origin', trusted)
        .send(signup(challenge, trusted))
        .expect(201);
      const body = response.body as { auth_id: string; token: string };
      expect(body.auth_id).toMatch(/^user_/);
      expect(typeof body.token).toBe('string');
      expect(body).toEqual({
        success: true,
        auth_id: body.auth_id,
        user: {
          id: body.auth_id,
          auth_id: body.auth_id,
          username: 'Ana',
          email: null,
        },
        token: body.token,
        message: 'Usuario registrado exitosamente',
      });
      expect(jwt.verify<Record<string, unknown>>(body.token)).toEqual(
        expect.objectContaining({
          sub: body.auth_id,
          username: 'Ana',
        }),
      );
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0][0]).toBe('pa_usuario_registrar');
    },
  );

  it.each([origin, secondOrigin])(
    'acepta login firmado de cuenta legada en %s',
    async (trusted) => {
      const challenge = auth.generateChallenge().challenge;
      const response = await request(httpServer)
        .post('/api/auth/login')
        .set('Origin', trusted)
        .send(login(challenge, trusted))
        .expect(201);
      const body = response.body as { token: string };
      expect(typeof body.token).toBe('string');
      expect(body).toEqual({
        success: true,
        auth_id: 'cuenta-legada',
        user: {
          id: 'cuenta-legada',
          auth_id: 'cuenta-legada',
          username: 'Ana',
        },
        token: body.token,
        message: 'Login exitoso',
      });
      expect(updateCounter).toHaveBeenCalledWith(
        'cuenta-legada',
        'Y3JlZGVuY2lhbC1zaW50ZXRpY2E',
        1,
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['register', 400],
    ['login', 401],
  ] as const)(
    '%s rechaza orígenes ausentes, inválidos o ajenos',
    async (route, status) => {
      for (const untrusted of [
        undefined,
        'null',
        'https://ajeno.vercel.app',
        'https://pwa-r3foresta.vercel.app.evil.invalid',
        'http://localhost:5173',
      ]) {
        const challenge = auth.generateChallenge().challenge;
        let call = request(httpServer).post(`/api/auth/${route}`);
        if (untrusted !== undefined) call = call.set('Origin', untrusted);
        const response = await call
          .send(route === 'register' ? signup(challenge) : login(challenge))
          .expect(status);
        expect((response.body as { message: string }).message).toBe(
          'Origen WebAuthn no permitido.',
        );
      }
      expect(rpc).not.toHaveBeenCalled();
      expect(findCredential).not.toHaveBeenCalled();
      expect(updateCounter).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['register', 400],
    ['login', 401],
  ] as const)(
    '%s rechaza header permitido con clientData de otro origen',
    async (route, status) => {
      for (const ceremonyOrigin of [secondOrigin, 'https://ajeno.vercel.app']) {
        const challenge = auth.generateChallenge().challenge;
        const response = await request(httpServer)
          .post(`/api/auth/${route}`)
          .set('Origin', origin)
          .send(
            route === 'register'
              ? signup(challenge, ceremonyOrigin)
              : login(challenge, ceremonyOrigin),
          )
          .expect(status);
        expect((response.body as { message: string }).message).toContain(
          'origin',
        );
      }
      expect(rpc).not.toHaveBeenCalled();
      expect(updateCounter).not.toHaveBeenCalled();
    },
  );

  it('conserva validación del alta antes de verificar o persistir', async () => {
    for (const extra of [
      { rol: 'ADMIN' },
      { activo: true },
      { email: 'correo-invalido' },
    ]) {
      await request(httpServer)
        .post('/api/auth/register')
        .set('Origin', origin)
        .send({ ...signup(auth.generateChallenge().challenge), ...extra })
        .expect(422);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('un conflicto SQL conserva el rechazo HTTP del registro y no emite JWT', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'USUARIO_YA_EXISTE' },
    });
    const response = await request(httpServer)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send(signup(auth.generateChallenge().challenge))
      .expect(400);
    const body = response.body as { message: string; token?: string };
    expect(body.message).toBe('El usuario ya existe');
    expect(body.token).toBeUndefined();
  });
});
