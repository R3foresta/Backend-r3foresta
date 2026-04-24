import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

const BUSINESS_TIME_ZONE = 'America/La_Paz';

export class FechaRecoleccionPolicy {
  static assertFechaRecoleccionPermitida(value: string): string {
    const fechaRecoleccion = this.normalizeIsoDateString(value, 'fecha');
    const fechaActualNegocio = this.getCurrentBusinessDate();
    const fechaMinimaPermitida = this.addDaysToIsoDate(fechaActualNegocio, -45);

    if (fechaRecoleccion > fechaActualNegocio) {
      throw new BadRequestException('La fecha no puede ser futura');
    }

    if (fechaRecoleccion < fechaMinimaPermitida) {
      throw new BadRequestException(
        'La fecha no puede ser mayor a 45 días atrás',
      );
    }

    return fechaRecoleccion;
  }

  static getCurrentBusinessDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new InternalServerErrorException(
        'No se pudo resolver la fecha actual de negocio.',
      );
    }

    return `${year}-${month}-${day}`;
  }

  static normalizeIsoDateString(value: string, fieldName: string): string {
    const normalized = String(value ?? '').trim();
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!isoDatePattern.test(normalized)) {
      throw new BadRequestException(`${fieldName} debe tener formato YYYY-MM-DD`);
    }

    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException(`${fieldName} no es una fecha válida`);
    }

    return normalized;
  }

  static addDaysToIsoDate(isoDate: string, days: number): string {
    const baseDate = new Date(`${isoDate}T00:00:00Z`);
    baseDate.setUTCDate(baseDate.getUTCDate() + days);
    return baseDate.toISOString().slice(0, 10);
  }
}
