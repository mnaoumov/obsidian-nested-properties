import type { GenericObject } from 'obsidian-dev-utils/type-guards';

export function convertValue(value: unknown, targetType: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- We want to convert the value to a string.
  const str = String(value ?? '');
  switch (targetType) {
    case 'aliases':
    case 'multitext':
    case 'tags':
      if (Array.isArray(value)) {
        return value;
      }
      if (str) {
        return [str];
      }
      return [];
    case 'checkbox':
      return Boolean(value);
    case 'date':
    case 'datetime':
      if (typeof value === 'string' && value && window.moment(value).isValid()) {
        return value;
      }
      return null;
    case 'number':
      return Number(str) || 0;
    case 'object':
      if (value !== null && typeof value === 'object') {
        return value;
      }
      return {};
    case 'text':
    default:
      return str;
  }
}

export function isComplexValue(value: unknown): value is GenericObject | unknown[] {
  return value !== null && typeof value === 'object';
}

export function isSimpleArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => !isComplexValue(item));
}
