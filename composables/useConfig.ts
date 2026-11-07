import { createGlobalState } from '@vueuse/core'
import { useBuildDeployment } from './useBuildDeployment'

export type Config = {
  title: string
  icon: string
  /** Legacy configuration field; dataset versions are selected in the Prolific interface. */
  version?: string
  contactEmail: string
  completion: { mode: 'prolific' } | { mode: 'link', link: string}
  navPages?: Record<string, string>
}


let _config: Config | null = null

export const defineEpochConfig = (config: Config): Config => {
  _config = config
  return config
}

export const useConfig = createGlobalState(() => {
  if (!_config) {
    throw new Error(
      'Epoch config not initialized. Import epoch.config.ts in your app or create a plugin to initialize it before using the framework.'
    )
  }
  return reactive({ ..._config, version: useBuildDeployment()?.version })
})
