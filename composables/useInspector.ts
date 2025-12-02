interface InspectorEntry {
  id: string
  label: string
  data: any
}

const inspectorState = reactive<Map<string, InspectorEntry>>(new Map())
const globalInspector = reactive<Record<string, any>>({})

export const useInspector = () => {
  return {
    entries: readonly(inspectorState),
    global: readonly({id: 'global', label: 'Global', data: globalInspector}),
    clear: () => inspectorState.clear()
  }
}

export const inspect = (data: any): Record<string, any> => {
  if (typeof data !== 'object') {
    data = {value: data}
  }
  Object.assign(globalInspector, data)
  return globalInspector
}

export const useInspect = (data: any, label?: string): Record<string, any> => {
  if (typeof data !== 'object') {
    data = {value: data}
  }
  const componentInstance = getCurrentInstance()
  if (!componentInstance) {
    console.warn('useInspect must be called within a component setup function; try inspect() instead')
    return {}
  }

  const componentName = componentInstance.type.__name || componentInstance.type.name || 'Unknown'
  const id = `${componentName}-${componentInstance.uid}`
  const finalLabel = label || componentName

  const entry: InspectorEntry = {
    id,
    label: finalLabel,
    data
  }

  inspectorState.set(id, entry)

  onUnmounted(() => {
    inspectorState.delete(id)
  })

  return data
}
