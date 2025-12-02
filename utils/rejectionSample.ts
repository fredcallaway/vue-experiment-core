type RejectionSampleOptions<T> = {
  generate: () => T
  accept: (t: T) => boolean
  maxTry?: number
  onFailure: 'error' | 'generate' | (() => T)
}

export function rejectionSample<T>(opt: RejectionSampleOptions<T>) {
  const { generate, accept, maxTry = 10000, onFailure = 'generate' } = opt
  let t: T
  for (let i = 0; i < maxTry; i++) {
    t = generate()
    if (accept(t)) {
      if (i > 0.5 * maxTry) {
        logDebug(`rejectionSample used more than half of maxTry: ${i+1}/${maxTry}`)
      } else {
        logDebug(`rejectionSample accepted after ${i+1} tries`)
      }
      return t
    }
  }
  switch (onFailure) {
    case 'error':
      throw new Error(`failed to sample after ${maxTry} tries`)
    case 'generate':
      logEvent('experiment.warn.rejectionSampleFailed')
      return generate()
    default:
      logEvent('experiment.warn.rejectionSampleFailed')
      return onFailure()
  }
}