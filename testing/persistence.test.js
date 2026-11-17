import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import * as VueUse from '@vueuse/core'
import { compileScript, parse } from '@vue/compiler-sfc'

// Isolate module mocks from other suites that also replace useDatabase.
if (process.env.EXPERIMENT_PERSISTENCE_TEST_CHILD !== '1') {
  test('initialized persistence and rendered completion regression suite', () => {
    const result = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, EXPERIMENT_PERSISTENCE_TEST_CHILD: '1' },
      encoding: 'utf8',
    })
    expect(result.stderr + result.stdout).not.toContain('(fail)')
    expect(result.status, result.stderr + result.stdout).toBe(0)
  })
} else {
  Object.assign(globalThis, Vue)
  const online = Vue.ref(true)
  const scheduled = new Set()
  const timeouts = []
  let writer, meta, database, config, scope, app, root, values, writes, update, clientListener
  let eventIndex = 0
  const logEvent = (eventType, data = {}) => writer.pushEvent({
    timestamp: Date.now(), index: eventIndex++, uid: 'test', currentEpochId: 'Completion', eventType,
    data: JSON.parse(JSON.stringify(data)),
  })
  mock.module('@vueuse/core', () => ({
    ...VueUse,
    useOnline: () => online,
    useDebounceFn: fn => () => { scheduled.add(fn) },
    useTimeout: () => {
      const elapsed = Vue.ref(false)
      timeouts.push(elapsed)
      return elapsed
    },
  }))
  mock.module('../composables/useDatabase', () => ({ useDatabase: () => database }))
  mock.module('../composables/logEvent', () => ({
    logEvent,
    logError: (message, info) => logEvent('error', { message, info }),
  }))
  mock.module('../composables/useInactivityTracker', () => ({
    useInactivityTracker: () => ({ getTotalInactiveTime: () => 0 }),
  }))
  mock.module('../composables/useCurrentSession', () => ({ useCurrentSession: () => meta }))
  mock.module('../composables/useConfig', () => ({ useConfig: () => config }))
  mock.module('../composables/useBonus', () => ({ useBonus: () => ({ hasAddedPoints: false }) }))
  mock.module('../composables/useEpoch', () => ({ useEpoch: () => ({}) }))
  mock.module('../internal/composables/useUnload', () => ({ useUnload: () => ({ disable() {} }) }))
  mock.module('../internal/prolific', () => ({ getCompletionCode: type => `CODE_${type}` }))

  const { DataWriter } = await import('../composables/useDataWriter')
  mock.module('../composables/useDataWriter', () => ({ DataWriter, useDataWriter: () => writer }))
  Bun.plugin({
    name: 'completion-test-sfc',
    setup(builder) {
      builder.onLoad({ filter: /ECompletion\.vue$/ }, ({ path }) => {
        const { descriptor } = parse(readFileSync(path, 'utf8'))
        const script = compileScript(descriptor, { id: 'completion-test', inlineTemplate: true })
        const contents = new Bun.Transpiler({ loader: 'ts' }).transformSync(script.content)
        return { contents, loader: 'js' }
      })
    },
  })
  const Completion = (await import('../components/epochs/ECompletion.vue')).default

  // Vue's real renderer runs the compiled SFC against a minimal in-memory host.
  const node = (tag = '', text = '') => ({ tag, text, children: [], props: {}, parent: null })
  const remove = child => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
  }
  const renderer = Vue.createRenderer({
    createElement: tag => node(tag),
    createText: text => node('', text),
    createComment: () => node(),
    setText: (el, text) => { el.text = text },
    setElementText: (el, text) => { el.text = text; el.children = [] },
    patchProp: (el, key, prev, next) => { el.props[key] = next },
    insert(child, parent, anchor = null) {
      remove(child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : parent.children.length
      parent.children.splice(index, 0, child)
    },
    remove,
    parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1],
  })
  const text = (el = root) => el.text + el.children.map(text).join(' ')
  const elements = (tag, el = root) => [
    ...(el.tag === tag ? [el] : []), ...el.children.flatMap(child => elements(tag, child)),
  ]
  const tick = async () => { for (let i = 0; i < 12; i++) await Vue.nextTick() }
  const deferred = () => {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
  }
  const stored = () => JSON.parse(localStorage.getItem(`dataWriter-${meta.sessionId}`))
  const markerPath = () => `live/other/${meta.sessionId}/marker`
  const metaPath = () => `live/meta/${meta.sessionId}`
  const start = async () => {
    expect(await scope.run(() => writer.initializeSession(meta))).toBe(true)
    await writer.flush()
    scheduled.clear()
    writes.length = 0
  }
  const mountCompletion = async (props = {}) => {
    root = node('root')
    app = renderer.createApp(Completion, props)
    app.mount(root)
    // The minimum display wait expires independently of the long-wait fallback.
    timeouts.at(-1).value = true
    await tick()
  }
  const retry = async () => {
    const button = elements('button').find(el => /try.*again|retry/i.test(text(el)))
    expect(button).toBeDefined()
    await button.props.onClick()
    await tick()
  }
  let logs
  beforeEach(() => {
    logs = ['debug', 'log', 'warn', 'error'].map(method => spyOn(console, method).mockImplementation(() => {}))
    globalThis.localStorage = {
      getItem(key) { return Object.hasOwn(this, key) ? this[key] : null },
      setItem(key, value) { this[key] = value },
      removeItem(key) { delete this[key] },
    }
    online.value = true
    timeouts.length = 0
    scheduled.clear()
    values = {}
    writes = []
    clientListener = null
    update = async () => {}
    database = {
      async assertConnected() {},
      async get(path) {
        return { exists: () => Object.hasOwn(values, path), val: () => structuredClone(values[path]) }
      },
      async set(path, value) { values[path] = structuredClone(Vue.toRaw(value)) },
      onValue(path, callback) {
        clientListener = callback
        callback({ val: () => values[path] })
      },
      async update(path, batch) {
        const snapshot = structuredClone(batch)
        writes.push(snapshot)
        await update(snapshot)
        Object.assign(values, snapshot)
      },
    }
    meta = Vue.reactive({
      sessionId: 'persistence-test', participantId: 'participant', studyId: 'study', mode: 'live',
      version: 'test', startTime: Date.now(), lastUpdateTime: Date.now(), bonus: 0, assignment: 0,
    })
    config = { completion: { mode: 'link', link: 'https://example.com' }, contactEmail: 'test@example.com' }
    scope = Vue.effectScope()
    writer = scope.run(() => new DataWriter())
  })
  afterEach(() => {
    app?.unmount()
    app = null
    scope.stop()
    logs.forEach(log => log.mockRestore())
  })

  test.each(['link', 'prolific'])('offline %s completion retains data without successful submission', async mode => {
    await start()
    if (mode === 'prolific') config.completion = { mode }
    writer.updateOther('marker', 'offline marker')
    online.value = false
    await mountCompletion()
    timeouts.forEach(timeout => { timeout.value = true })
    await tick()
    expect(text()).toContain('internet connection is down')
    expect(text()).not.toContain('Your data has been saved')
    expect(elements('button')).toHaveLength(0)
    expect(writes).toHaveLength(0)
    expect(writer.hasPendingUpdates).toBe(true)
    expect(stored()[markerPath()]).toBe('offline marker')
  })

  test('reconnection saves the original marker and completion before showing success', async () => {
    await start()
    writer.updateOther('marker', 'reconnect marker')
    online.value = false
    await mountCompletion()
    const ack = deferred()
    update = () => ack.promise
    online.value = true
    await tick()
    expect(text()).not.toContain('Your data has been saved')
    expect(values[markerPath()]).toBeUndefined()
    ack.resolve()
    await tick()
    expect(text()).toContain('Your data has been saved')
    expect(values[markerPath()]).toBe('reconnect marker')
    expect(values[metaPath()].completionTime).toBe(meta.completionTime)
    expect(Object.keys(values).some(path => path.includes('experiment:complete'))).toBe(true)
  })

  test('rejection keeps exact data recoverable and explicit retry succeeds', async () => {
    await start()
    writer.updateOther('marker', 'rejected marker')
    update = async () => { throw new Error('permission denied') }
    await mountCompletion()
    expect(text()).not.toContain('Your data has been saved')
    expect(writer.hasPendingUpdates).toBe(true)
    expect(stored()[markerPath()]).toBe('rejected marker')
    expect(values[markerPath()]).toBeUndefined()
    update = async () => {}
    await retry()
    expect(text()).toContain('Your data has been saved')
    expect(values[markerPath()]).toBe('rejected marker')
  })

  test('ordinary success waits for acknowledgment and preserves completion metadata', async () => {
    await start()
    writer.updateOther('marker', 'ordinary marker')
    const ack = deferred()
    update = () => ack.promise
    await mountCompletion()
    expect(writer.hasPendingUpdates).toBe(true)
    expect(stored()[markerPath()]).toBe('ordinary marker')
    expect(stored()[metaPath()].completionTime).toBe(meta.completionTime)
    expect(text()).not.toContain('Your data has been saved')
    ack.resolve()
    await tick()
    expect(text()).toContain('Your data has been saved')
    expect(writer.hasPendingUpdates).toBe(false)
    expect(stored()).toEqual({})
  })

  test('failed Prolific save uses disconnected code and retry restores completed code', async () => {
    await start()
    config.completion = { mode: 'prolific' }
    update = async () => { throw new Error('write rejected') }
    await mountCompletion()
    timeouts.forEach(timeout => { timeout.value = true })
    await tick()
    expect(text()).toContain('CODE_DISCONNECTED')
    expect(text()).not.toContain('CODE_COMPLETED')
    update = async () => {}
    await retry()
    expect(text()).toContain('CODE_COMPLETED')
  })

  test('failed in-flight write preserves newer metadata and same-path updates on retry', async () => {
    await start()
    writer.updateOther('marker', 'older')
    const ack = deferred()
    update = () => ack.promise
    const first = writer.flush()
    writer.updateOther('marker', 'newer')
    logEvent('trial.response', { response: 'new event' })
    meta.bonus = 123
    ack.reject(new Error('rejected'))
    expect(await first).toBe(false)
    expect(stored()[markerPath()]).toBe('newer')
    update = async () => {}
    expect(await writer.flush()).toBe(true)
    expect(values[markerPath()]).toBe('newer')
    expect(values[metaPath()].bonus).toBe(123)
    expect(Object.keys(values).some(path => path.includes('trial:response'))).toBe(true)
  })

  test('repeated rejections keep a bounded batch without self-scheduling or recursive error copies', async () => {
    await start()
    writer.updateOther('marker', 'persistent rejection')
    update = async () => { throw new Error('permission denied') }
    await tick()
    scheduled.clear()
    const eventCount = writer.events.length
    const queueSize = Object.keys(stored()).length
    for (let i = 0; i < 5; i++) expect(await writer.flush()).toBe(false)
    expect(scheduled.size).toBe(0)
    expect(writer.events).toHaveLength(eventCount)
    expect(Object.keys(stored())).toHaveLength(queueSize + 1) // full session metadata
    expect(stored()[markerPath()]).toBe('persistent rejection')
  })

  test('concurrent flush callers serialize and cannot acknowledge a newer completion early', async () => {
    await start()
    writer.updateOther('marker', 'older')
    const firstAck = deferred()
    const secondAck = deferred()
    update = () => writes.length === 1 ? firstAck.promise : secondAck.promise
    const first = writer.flush()
    writer.updateOther('marker', 'newer')
    await mountCompletion()
    expect(writes).toHaveLength(1)
    firstAck.resolve()
    expect(await first).toBe(true)
    await tick()
    expect(writes).toHaveLength(2)
    expect(writer.hasPendingUpdates).toBe(true)
    expect(stored()[markerPath()]).toBe('newer')
    expect(text()).not.toContain('Your data has been saved')
    secondAck.resolve()
    await tick()
    expect(text()).toContain('Your data has been saved')
    expect(values[markerPath()]).toBe('newer')
    expect(values[metaPath()].completionTime).toBe(meta.completionTime)
  })

  test('live recovery storage retains an unacknowledged batch across a fresh writer', async () => {
    await start()
    writer.updateOther('marker', 'recover after reload')
    const ack = deferred()
    update = () => ack.promise
    const pending = writer.flush()
    await tick()
    expect(stored()[markerPath()]).toBe('recover after reload')
    ack.reject(new Error('connection lost'))
    expect(await pending).toBe(false)
    scope.stop()
    scope = Vue.effectScope()
    writer = scope.run(() => new DataWriter())
    update = async () => {}
    expect(await scope.run(() => writer.initializeSession(meta))).toBe(true)
    expect(await writer.flush()).toBe(true)
    expect(values[markerPath()]).toBe('recover after reload')
  })

  test('background reconnect flush uses the same acknowledgment and recovery contract', async () => {
    await start()
    online.value = false
    writer.updateOther('marker', 'background reconnect')
    expect(await writer.flush()).toBe(false)
    scheduled.clear()
    online.value = true
    await tick()
    expect(scheduled.size).toBeGreaterThan(0)
    await Promise.all([...scheduled].map(flush => flush()))
    expect(values[markerPath()]).toBe('background reconnect')
    expect(writer.hasPendingUpdates).toBe(false)
  })

  test.each(['disabled', 'superseded'])('%s writers retain their queue and cannot confirm saving', async state => {
    await start()
    writer.updateOther('marker', state)
    if (state === 'disabled') writer.disable()
    else clientListener({ val: () => 'another client' })
    expect(await writer.flush()).toBe(false)
    expect(writer.hasPendingUpdates).toBe(true)
    expect(writes).toHaveLength(0)
  })

  test('superseded during a write cannot confirm completion or start another write', async () => {
    await start()
    const ack = deferred()
    update = () => ack.promise
    await mountCompletion()
    clientListener({ val: () => 'another client' })
    ack.resolve()
    await tick()
    expect(text()).not.toContain('Your data has been saved')
    expect(await writer.flush()).toBe(false)
    expect(writes).toHaveLength(1)
  })

  test('uninitialized development completion stays local until explicitly saved', async () => {
    await mountCompletion()
    expect(text()).toContain('development mode')
    expect(await writer.flush()).toBe(false)
    expect(writes).toHaveLength(0)
    expect(writer.events.some(event => event.eventType === 'experiment.complete')).toBe(true)
  })

  test('initialized debug mode still requires database acknowledgment', async () => {
    meta.mode = 'debug'
    await start()
    const ack = deferred()
    update = () => ack.promise
    await mountCompletion()
    expect(text()).not.toContain('Your data has been saved')
    ack.resolve()
    await tick()
    expect(text()).toContain('Your data has been saved')
    expect(values[`debug/meta/${meta.sessionId}`].completionTime).toBe(meta.completionTime)
  })

  test('error completion preserves the error code after acknowledged saving', async () => {
    await start()
    config.completion = { mode: 'prolific' }
    const ack = deferred()
    update = () => ack.promise
    await mountCompletion({ error: true })
    expect(text()).not.toContain('CODE_ERROR')
    ack.resolve()
    await tick()
    expect(text()).toContain('CODE_ERROR')
    expect(text()).not.toContain('CODE_COMPLETED')
  })

  test('development save button initializes debug persistence and reports its acknowledgment', async () => {
    meta.mode = 'debug'
    await mountCompletion()
    const button = elements('button').find(el => text(el).includes('Save data to debug database'))
    expect(button).toBeDefined()
    await button.props.onClick()
    await tick()
    expect(text()).not.toContain('development mode')
    expect(text()).toContain('Your data has been saved')
    expect(values[`debug/meta/${meta.sessionId}`].completionTime).toBe(meta.completionTime)
  })

  test('failed initialization cannot turn a dummy flush into successful completion', async () => {
    database.assertConnected = async () => { throw new Error('initialization failed') }
    expect(await scope.run(() => writer.initializeSession(meta))).toBeInstanceOf(Error)
    await mountCompletion()
    expect(text()).not.toContain('Your data has been saved')
    expect(await writer.flush()).toBe(false)
    expect(writer.hasPendingUpdates).toBe(true)
    expect(writes).toHaveLength(0)
  })

  test('initialization cannot flush session data before metadata is established', async () => {
    const connection = deferred()
    database.assertConnected = () => connection.promise
    logEvent('trial.response', { response: 'before initialization' })
    const initialization = scope.run(() => writer.initializeSession(meta))
    expect(writer.writable).toBe(false)
    expect(await writer.flush()).toBe(false)
    expect(writes).toHaveLength(0)
    connection.resolve()
    expect(await initialization).toBe(true)
    expect(writer.writable).toBe(true)
    expect(await writer.flush()).toBe(true)
    expect(Object.keys(values).some(path => path.includes('trial:response'))).toBe(true)
  })

  test('paused saving retains local events and resumes without reinitializing the session', async () => {
    meta.mode = 'debug'
    await start()
    writer.savingPaused.value = true
    logEvent('trial.response', { response: 'while paused' })
    expect(writer.writable).toBe(false)
    expect(await writer.flush()).toBe(false)
    expect(writes).toHaveLength(0)
    expect(writer.hasPendingUpdates).toBe(true)
    writer.savingPaused.value = false
    expect(await writer.flush()).toBe(true)
    expect(Object.keys(values).some(path => path.includes('trial:response'))).toBe(true)
  })
}
