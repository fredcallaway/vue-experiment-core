import * as R from 'remeda'
export { R }

// chunks the list into sublists, breaking whenever predicate is true
function _chunkBy<T>(list: T[], predicate: (x: T) => boolean): T[][] {
  const chunks: T[][] = []
  let currentChunk: T[] = []
  for (const x of list) {
    if (predicate(x) && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
    }
    currentChunk.push(x)
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }
  return chunks
}

function chunkBy<T>(array: T[], fn: (item: T) => boolean): T[][];
function chunkBy<T>(fn: (item: T) => boolean): (array: T[]) => T[][];
function chunkBy(...args: unknown[]) {
  return R.purry(_chunkBy, args);
}

export { chunkBy }