export type Config = {
  url: string
  title: string
  icon: string
  version: string
  contactEmail: string
  completion: { mode: 'prolific' } | { mode: 'link', link: string}
  firebase: {
    projectId: string
    appId: string
    databaseURL: string
    storageBucket: string
    apiKey: string
    authDomain: string
    messagingSenderId: string
    measurementId: string
  }
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
  return reactive({ ..._config })
})
