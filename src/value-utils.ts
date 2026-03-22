import type { GenericObject } from 'obsidian-dev-utils/type-guards';

export function convertValue(value: unknown, targetType: string): unknown {
  switch (targetType) {
    case 'aliases':
    case 'multitext':
    case 'tags':
      return convertToList(value);
    case 'checkbox':
      return Boolean(value);
    case 'date':
    case 'datetime':
      return convertToDate(value);
    case 'number':
      return convertToNumber(value);
    case 'object':
      return convertToObject(value);
    case 'text':
    default:
      return convertToString(value);
  }
}

export function isComplexValue(value: unknown): value is GenericObject | unknown[] {
  return value !== null && typeof value === 'object';
}

export function isSimpleArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => !isComplexValue(item));
}

function convertToDate(value: unknown): null | string {
  if (typeof value === 'string' && value && window.moment(value).isValid()) {
    return value;
  }
  return null;
}

function convertToList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as GenericObject);
  }
  const str = convertToString(value);
  if (str) {
    return [str];
  }
  return [];
}

function convertToNumber(value: unknown): number {
  return Number(convertToString(value)) || 0;
}

function convertToObject(value: unknown): GenericObject {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((item, index) => [String(index), item]));
  }
  if (value !== null && typeof value === 'object') {
    return value as GenericObject;
  }
  return {};
}

function convertToString(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- We want to convert the value to a string.
  return String(value ?? '');
}
