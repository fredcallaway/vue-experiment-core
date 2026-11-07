import type { DeploymentIdentity } from '../internal/deploymentIdentity'

export function useBuildDeployment(): DeploymentIdentity | null {
  return JSON.parse(useRuntimeConfig().public.experimentDeployment || 'null')
}
