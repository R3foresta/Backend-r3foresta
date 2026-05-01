import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';

describe('RegistrarEmbolsadoDto', () => {
  it('transforma evidencia_ids numericos y acepta enteros positivos unicos', async () => {
    const dto = plainToInstance(RegistrarEmbolsadoDto, {
      fecha_evento: '2026-04-25',
      plantas_vivas_iniciales: '100',
      evidencia_ids: ['137', '138'],
      observaciones: 'Embolsado de prueba',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.plantas_vivas_iniciales).toBe(100);
    expect(dto.evidencia_ids).toEqual([137, 138]);
  });

  it('rechaza evidencia_ids vacios, duplicados o menores a 1', async () => {
    const dto = plainToInstance(RegistrarEmbolsadoDto, {
      fecha_evento: '2026-04-25',
      plantas_vivas_iniciales: 100,
      evidencia_ids: [137, 137, 0],
    });

    const errors = await validate(dto);
    const evidenciaIdsError = errors.find(
      (error) => error.property === 'evidencia_ids',
    );

    expect(evidenciaIdsError).toBeDefined();
    expect(evidenciaIdsError?.constraints).toEqual(
      expect.objectContaining({
        arrayUnique: 'evidencia_ids no debe contener IDs duplicados',
        min: 'each value in evidencia_ids must not be less than 1',
      }),
    );
  });
});
