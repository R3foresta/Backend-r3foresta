import { INestApplication, RequestMethod } from '@nestjs/common';

export function configureGlobalRoutes(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}
