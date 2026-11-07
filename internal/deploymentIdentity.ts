export type DeploymentIdentity = {
  id: string
  version: string
  sha: string
  fullSha?: string
}

export function datasetVersionError(version: unknown): string {
  return typeof version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(version)
    ? '' : 'Choose a dataset version using letters, numbers, dots, hyphens, or underscores; start with a letter or number.'
}
