import type { GenericObject } from 'obsidian-dev-utils/type-guards';

import { moment } from 'obsidian';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';

const momentFunction = extractDefaultExportInterop(moment);

const ELIDED_ARRAY = '[ ... ]';
const ELIDED_OBJECT = '{ ... }';
const EMPTY_SCALAR = '';

// Long enough to read the shape of a typical nested property at a glance, short enough that the collapsed
// Row never pushes the Properties panel wider than the note.
const MAX_SUMMARY_BODY_LENGTH = 120;

interface ConvertValueParams {
  readonly targetType: string;
  readonly value: unknown;
}

interface IsLossyConversionParams {
  readonly targetType: string;
  readonly value: unknown;
}

interface JoinSummaryEntriesParams {
  readonly closeBracket: string;
  readonly entries: readonly string[];
  readonly openBracket: string;
}

export function convertValue(params: ConvertValueParams): unknown {
  const { targetType, value } = params;
  switch (targetType) {
    case 'aliases':
    case 'multitext':
    case 'tags': {
      return convertToSimpleList(value);
    }
    case 'checkbox': {
      return Boolean(value);
    }
    case 'date':
    case 'datetime': {
      return convertToDate(value);
    }
    case 'list': {
      return convertToMixedList(value);
    }
    case 'number': {
      return convertToNumber(value);
    }
    case 'object': {
      return convertToObject(value);
    }
    default: {
      return convertToString(value);
    }
  }
}

/**
 * A one-line, human-readable rendition of a complex value, shown in place of the value while it is
 * collapsed - so a collapsed nested property is still legible without expanding it (issue #12).
 *
 * Only the value's own entries are rendered; a nested complex value inside it is elided as `{ ... }` /
 * `[ ... ]`, which keeps the collapsed row exactly one line tall.
 */
export function formatValueSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return joinSummaryEntries({ closeBracket: ']', entries: value.map((item) => formatSummaryItem(item)), openBracket: '[' });
  }

  if (isComplexValue(value)) {
    return joinSummaryEntries({
      closeBracket: '}',
      entries: Object.entries(value).map(([key, item]) => `${key}: ${formatSummaryItem(item)}`),
      openBracket: '{'
    });
  }

  return formatSummaryScalar(value);
}

export function isComplexValue(value: unknown): value is GenericObject | unknown[] {
  return value !== null && typeof value === 'object';
}

export function isLossyConversion(params: IsLossyConversionParams): boolean {
  const { targetType, value } = params;
  switch (targetType) {
    case 'aliases':
    case 'multitext':
    case 'tags': {
      return !isSimpleArray(value);
    }
    case 'list': {
      return !Array.isArray(value);
    }
    case 'object': {
      return !isComplexValue(value) || Array.isArray(value);
    }
    default: {
      return false;
    }
  }
}

export function isSimpleArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => !isComplexValue(item));
}

function convertToDate(value: unknown): null | string {
  if (typeof value === 'string' && value && momentFunction(value).isValid()) {
    return value;
  }
  return null;
}

function convertToMixedList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === 'object') {
    return [value];
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

function convertToNumber(value: unknown): number {
  return Number(convertToString(value)) || 0;
}

function convertToObject(value: unknown): GenericObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as GenericObject;
  }
  return {};
}

function convertToSimpleList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return isSimpleArray(value) ? value : value.filter((item) => !isComplexValue(item));
  }
  if (value !== null && typeof value === 'object') {
    return [];
  }
  const $string = convertToString(value);
  if ($string) {
    return [$string];
  }
  return [];
}

function convertToString(value: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- We want to convert the value to a string.
  return String(value ?? '');
}

function formatSummaryItem(value: unknown): string {
  if (Array.isArray(value)) {
    return ELIDED_ARRAY;
  }

  if (isComplexValue(value) && !(value instanceof Date)) {
    return ELIDED_OBJECT;
  }

  return formatSummaryScalar(value);
}

function formatSummaryScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_SCALAR;
  }

  if (value instanceof Date) {
    return momentFunction(value).format('YYYY-MM-DD');
  }

  return convertToString(value);
}

function joinSummaryEntries(params: JoinSummaryEntriesParams): string {
  const { closeBracket, entries, openBracket } = params;
  if (entries.length === 0) {
    return `${openBracket}${closeBracket}`;
  }

  const body = entries.join(', ');
  const truncatedBody = body.length > MAX_SUMMARY_BODY_LENGTH ? `${body.slice(0, MAX_SUMMARY_BODY_LENGTH)}…` : body;
  return `${openBracket} ${truncatedBody} ${closeBracket}`;
}
