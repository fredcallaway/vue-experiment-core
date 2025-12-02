
export function range(...args: number[]): number[] {
  const [start, end, step] = 
  args.length === 1 ? [0, args[0], 1] :
  args.length === 2 ? [args[0], args[1], 1] :
  args
  return Array.from({ length: (end - start) / step }, (_, i) => start + i * step)
}

export function indices(x: ArrayLike<unknown>): number[] {
  return Array.from({ length: x.length }, (_, i) => i)
}

export function repeat<T>(xs: readonly T[], n: number): T[] {
  return Array.from({ length: n }, () => [...xs]).flat()
}

export function fill<T>(x: T, n: number): T[] {
  return new Array<T>(n).fill(x)
}

export function repeatedly<T>(n: number, fn: (idx: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i))
}

export function permutations(n: number): number[][] {
  if (n > 10) throw new Error(`permutations of ${n} is too large`)
  if (n <= 1) return [range(n)]
  const result: number[][] = []
  const arr = range(n)
  for (let i = 0; i < n; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of permutations(rest.length)) {
      result.push([arr[i]!, ...perm.map(j => rest[j]!)])
    }
  }
  return result
}


export function tuple<A>(a:A): [A]
export function tuple<A,B>(a:A, b:B): [A, B]
export function tuple<A,B,C>(a:A, b:B, c:C): [A, B, C]
export function tuple(...xs: unknown[]) {
  return [...xs]
} 

type ColTable<T extends Record<string, any>> = {
  [K in keyof T]: T[K][];
};

type RowTable<T extends Record<string, any>> = Array<T>;

export function cartesian<T extends unknown[]>(...arrays:{ [K in keyof T]: T[K][] }): T[] {
  return arrays.reduce<any[][]>(
    (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
    [[]]
  ) as T[]
}

export function expandGrid<T extends Record<string, any>>(obj: ColTable<T>): RowTable<T> {
  const keys = Object.keys(obj) as (keyof T)[]
  return cartesian(...Object.values(obj))
    .map((combo) =>
      Object.fromEntries(keys.map((key, i) => [key, combo[i]])) as T
    )
}

export function interleave<T>(...arrays: T[][]): T[] {
  const n = arrays[0]!.length
  arrays.forEach(a => {
    assert(a.length == n, 'all arrays must have the same length')
  })
  return range(n).flatMap(i => {
    return arrays.map(a => a[i]!)
  })
}

// NOTE: I'm not sure this interleaves as well as it could
export function interleaveUnbalanced<T>(longer: T[], shorter: T[]): T[] {
  const result: T[] = [];
  const n = longer.length;
  const m = shorter.length;
  const insertEvery = Math.floor(n / m);
  let extras = n % m;
  let j = 0;  // index for shorter
  let i = 0;  // index for longer

  while (i < n) {
    // Add from longer
    for (let _ = 0; _ < insertEvery + (extras > 0 ? 1 : 0); _++) {
      if (i < n) {
        result.push(longer[i]!);
        i++;
      }
    }
    // Add from shorter
    if (j < m) {
      result.push(shorter[j]!);
      j++;
    }
    if (extras > 0) {
      extras--;
    }

  }
  return result;
}

