import { participacionOpenApi } from '../../../participacion/participacion-openapi.generated';

// La misma lista permitida gobierna Swagger y las respuestas. Si SQL deriva
// campos privados o un contrato inválido, la API falla cerrada sin publicarlos.
export function validarImpacto(value: unknown, schema: string): void {
  const schemas = participacionOpenApi.components!.schemas!;
  const check = (ok: unknown) => {
    if (!ok) throw new Error('Proyección inválida');
  };
  const visit = (item: unknown, spec: any): void => {
    if (spec.$ref) {
      if (spec.$ref.endsWith('/Id')) {
        check(typeof item === 'string' && /^[1-9][0-9]{0,18}$/.test(item));
        check(BigInt(item as string) <= 9223372036854775807n);
      }
      return visit(item, schemas[spec.$ref.split('/').at(-1)]);
    }
    if (item === null && spec.nullable) return;
    if (spec.enum) check(spec.enum.includes(item));
    if (spec.type === 'object') {
      check(item !== null && typeof item === 'object' && !Array.isArray(item));
      const row = item as Record<string, unknown>;
      check(
        (spec.required ?? []).every((key: string) => Object.hasOwn(row, key)),
      );
      if (spec.additionalProperties === false)
        check(
          Object.keys(row).every((key) => Object.hasOwn(spec.properties, key)),
        );
      for (const [key, child] of Object.entries(spec.properties ?? {}))
        if (Object.hasOwn(row, key)) visit(row[key], child);
    } else if (spec.type === 'array') {
      check(Array.isArray(item));
      check(
        spec.minItems === undefined ||
          (item as unknown[]).length >= spec.minItems,
      );
      check(
        spec.maxItems === undefined ||
          (item as unknown[]).length <= spec.maxItems,
      );
      if (spec.uniqueItems)
        check(
          new Set((item as unknown[]).map((value) => JSON.stringify(value)))
            .size === (item as unknown[]).length,
        );
      for (const child of item as unknown[]) visit(child, spec.items);
    } else if (spec.type === 'integer' || spec.type === 'number') {
      check(typeof item === 'number' && Number.isFinite(item));
      if (spec.type === 'integer') check(Number.isSafeInteger(item));
      check(spec.minimum === undefined || (item as number) >= spec.minimum);
      check(spec.maximum === undefined || (item as number) <= spec.maximum);
    } else if (spec.type === 'string') {
      check(typeof item === 'string');
      check(!spec.pattern || new RegExp(spec.pattern).test(item as string));
      check(
        spec.maxLength === undefined ||
          (item as string).length <= spec.maxLength,
      );
      if (spec.format === 'date') {
        check(
          /^\d{4}-\d{2}-\d{2}$/.test(item as string) &&
            Number.isFinite(Date.parse(item as string)),
        );
        check(new Date(item as string).toISOString().slice(0, 10) === item);
      }
    } else if (spec.type === 'boolean') check(typeof item === 'boolean');
  };
  check(Object.hasOwn(schemas, schema));
  visit(value, schemas[schema]);
}
