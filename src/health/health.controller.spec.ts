import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('devuelve el estado del proceso sin dependencias externas', () => {
    const response = controller.getHealth();

    expect(response).toEqual({
      status: 'ok',
      service: 'r3foresta-backend',
      timestamp: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
    expect(response.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
