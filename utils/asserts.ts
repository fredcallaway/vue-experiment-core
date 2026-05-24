
export const isError = (value: any): value is Error => {
  try {
    // @ts-ignore  safari incompatible
    return Error.isError(value)
  } catch (e) {
    return value instanceof Error
  }
}
export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed');
  }
}

export function assertDefined<T>(value: T | undefined | null, message?: string): T {
  if (value === undefined || value === null) {
    throw new Error(message ?? 'Value is undefined or null');
  }
  return value;
}

export function assertString(x: unknown, message?: string): string {
  if (typeof x !== 'string') {
    throw new Error(message ?? `Expected string, got ${typeof x}`);
  }
  return x
}

export function assertNumber(x: unknown, message?: string): number {
  const n = Number(x)
  if (isNaN(n)) {
    throw new Error(message ?? `Invalid number: ${x}`);
  }
  return n
}

export function assertBoolean(x: unknown, message?: string): boolean {
  if (typeof x !== 'boolean') {
    throw new Error(message ?? `Expected boolean, got ${typeof x}`);
  }
  return x
}

export function assertArray<T>(x: unknown, message?: string): T[] {
  if (!Array.isArray(x)) {
    throw new Error(message ?? `Expected array, got ${typeof x}`);
  }
  return x
}

export function assertObject(x: unknown, message?: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) {
    throw new Error(message ?? `Expected object, got ${typeof x}`);
  }
  return x as Record<string, unknown>
}

export function assertOnly<T>(xs: T[], message?: string) {
  if (xs.length !== 1) {
    throw new Error(message ?? `Expected exactly one element, got ${xs.length}`);
  }
  return xs[0];
}


export function assertOneOf<T>(x: unknown, xs: readonly T[], message?: string): T {
  if (!xs.includes(x as T)) {
    throw new Error(message ?? `Expected one of ${xs.join(', ')}, got ${x}`);
  }
  return x as T
}