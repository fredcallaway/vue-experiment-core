import { createHash } from 'node:crypto'

const actions = ['click', 'press', 'fill', 'check', 'select', 'hover', 'waitFor', 'checkpoint']
const targetKeys = ['role', 'text', 'label', 'testId', 'css']

function object(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${path}.${key} is not supported`)
  }
}

function string(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a nonempty string`)
}

function integer(value, path, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${path} must be an integer >= ${minimum}`)
}

function slug(value, path) {
  string(value, path)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) throw new Error(`${path} must be a file-safe identifier`)
}

export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex')
}

export function canonical(value) {
  if (value === undefined) throw new Error('Cannot hash undefined')
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

export function validateTarget(target, path = 'target') {
  object(target, path, [...targetKeys, 'name', 'exact'])
  const strategies = targetKeys.filter(key => key in target)
  if (strategies.length !== 1) throw new Error(`${path} must have exactly one locator strategy`)
  string(target[strategies[0]], `${path}.${strategies[0]}`)
  if ('name' in target) {
    if (!('role' in target)) throw new Error(`${path}.name requires role`)
    string(target.name, `${path}.name`)
  }
  if ('exact' in target) {
    if (!['role', 'text', 'label'].includes(strategies[0]) || typeof target.exact !== 'boolean') {
      throw new Error(`${path}.exact requires a role, text, or label locator and a boolean`)
    }
  }
  return target
}

export function validateExpectations(expectations, path = 'assertions', required = false) {
  if (!Array.isArray(expectations) || (required && !expectations.length)) {
    throw new Error(`${path} must be ${required ? 'a nonempty' : 'an'} array`)
  }
  expectations.forEach((assertion, index) => {
    const at = `${path}[${index}]`
    object(assertion, at, ['kind', 'target', 'value', 'name', 'minCount', 'count', 'where'])
    if (['visible', 'hidden', 'text', 'count'].includes(assertion.kind)) {
      validateTarget(assertion.target, `${at}.target`)
      if (assertion.kind === 'text') string(assertion.value, `${at}.value`)
      if (assertion.kind === 'count') integer(assertion.value, `${at}.value`)
      if (['name', 'minCount', 'count', 'where'].some(key => key in assertion)) throw new Error(`${at} has event-only fields`)
      if (['visible', 'hidden'].includes(assertion.kind) && 'value' in assertion) {
        throw new Error(`${at}.value is not used by ${assertion.kind}`)
      }
    } else if (assertion.kind === 'url') {
      string(assertion.value, `${at}.value`)
      if (Object.keys(assertion).some(key => !['kind', 'value'].includes(key))) {
        throw new Error(`${at} URL assertion only accepts kind and value`)
      }
    } else if (assertion.kind === 'event') {
      string(assertion.name, `${at}.name`)
      if ('minCount' in assertion) integer(assertion.minCount, `${at}.minCount`, 1)
      if ('count' in assertion) integer(assertion.count, `${at}.count`)
      if ('minCount' in assertion && 'count' in assertion) throw new Error(`${at} cannot combine count with minCount`)
      if ('target' in assertion || 'value' in assertion) throw new Error(`${at} has DOM-only fields`)
      if ('where' in assertion) {
        if (!assertion.where || typeof assertion.where !== 'object' || Array.isArray(assertion.where)) {
          throw new Error(`${at}.where must be an object`)
        }
        canonical(assertion.where)
      }
    } else throw new Error(`${at}.kind is not supported`)
  })
  return expectations
}

export function validateStep(step, path = 'step') {
  object(step, path, ['action', 'target', 'key', 'value', 'checked', 'state', 'name', 'assertions', 'masks', 'timeoutMs', 'position'])
  if (!actions.includes(step.action)) throw new Error(`${path}.action is not supported`)
  const fields = {
    click: ['target', 'position'], press: ['target', 'key'], fill: ['target', 'value'],
    check: ['target', 'checked'], select: ['target', 'value'], hover: ['target'],
    waitFor: ['target', 'state'], checkpoint: ['name', 'assertions', 'masks'],
  }[step.action]
  for (const key of Object.keys(step)) {
    if (!['action', 'timeoutMs', ...fields].includes(key)) throw new Error(`${path}.${key} is not used by ${step.action}`)
  }
  if ('timeoutMs' in step) integer(step.timeoutMs, `${path}.timeoutMs`, 1)
  if (step.action !== 'checkpoint' && (step.action !== 'press' || 'target' in step)) {
    validateTarget(step.target, `${path}.target`)
  }
  if (step.action === 'press') string(step.key, `${path}.key`)
  if (step.action === 'fill' && typeof step.value !== 'string') throw new Error(`${path}.value must be a string`)
  if (step.action === 'check' && typeof step.checked !== 'boolean') throw new Error(`${path}.checked must be boolean`)
  if (step.action === 'select') {
    const values = Array.isArray(step.value) ? step.value : [step.value]
    if (!values.length || values.some(value => typeof value !== 'string')) {
      throw new Error(`${path}.value must be a string or nonempty string array`)
    }
  }
  if (step.action === 'waitFor' && !['visible', 'hidden', 'attached', 'detached'].includes(step.state)) {
    throw new Error(`${path}.state must be visible, hidden, attached, or detached`)
  }
  if ('position' in step) {
    object(step.position, `${path}.position`, ['x', 'y'])
    if (!['x', 'y'].every(key => Number.isFinite(step.position[key]) && step.position[key] >= 0)) {
      throw new Error(`${path}.position requires nonnegative x and y`)
    }
  }
  if (step.action === 'checkpoint') {
    slug(step.name, `${path}.name`)
    if ('assertions' in step) validateExpectations(step.assertions, `${path}.assertions`)
    if ('masks' in step) {
      if (!Array.isArray(step.masks)) throw new Error(`${path}.masks must be an array`)
      step.masks.forEach((mask, index) => {
        object(mask, `${path}.masks[${index}]`, ['selector', 'reason'])
        string(mask.selector, `${path}.masks[${index}].selector`)
        string(mask.reason, `${path}.masks[${index}].reason`)
      })
    }
  }
  return step
}

export function validateTrace(trace) {
  object(trace, 'trace', ['version', 'id', 'startUrl', 'viewport', 'rootSelector', 'runtime', 'scope', 'steps', 'completion'])
  if (trace.version !== 1) throw new Error('trace.version must be 1')
  slug(trace.id, 'trace.id')
  string(trace.startUrl, 'trace.startUrl')
  const url = new URL(trace.startUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('trace.startUrl must use HTTP(S)')
  object(trace.viewport, 'trace.viewport', ['width', 'height'])
  integer(trace.viewport.width, 'trace.viewport.width', 1)
  integer(trace.viewport.height, 'trace.viewport.height', 1)
  if ('rootSelector' in trace) string(trace.rootSelector, 'trace.rootSelector')
  if ('runtime' in trace) {
    object(trace.runtime, 'trace.runtime', ['fast', 'seed'])
    if ('fast' in trace.runtime && typeof trace.runtime.fast !== 'boolean') throw new Error('trace.runtime.fast must be boolean')
    if ('seed' in trace.runtime) string(trace.runtime.seed, 'trace.runtime.seed')
  }
  object(trace.scope, 'trace.scope', ['kind', 'label'])
  if (!['full', 'section'].includes(trace.scope.kind)) throw new Error('trace.scope.kind must be full or section')
  string(trace.scope.label, 'trace.scope.label')
  if (!Array.isArray(trace.steps) || !trace.steps.length) throw new Error('trace.steps must be nonempty')
  trace.steps.forEach((step, index) => validateStep(step, `trace.steps[${index}]`))
  const names = trace.steps.filter(step => step.action === 'checkpoint').map(step => step.name)
  if (!names.length) throw new Error('trace must include at least one visual checkpoint')
  if (trace.steps.at(-1).action !== 'checkpoint') throw new Error('trace must end with a visual checkpoint')
  if (new Set(names).size !== names.length) throw new Error('checkpoint names must be unique')
  validateExpectations(trace.completion, 'trace.completion', true)
  return trace
}

export function resolveTarget(page, target) {
  validateTarget(target)
  const exact = target.exact ?? true
  if ('role' in target) return page.getByRole(target.role, { ...(target.name ? { name: target.name } : {}), exact })
  if ('text' in target) return page.getByText(target.text, { exact })
  if ('label' in target) return page.getByLabel(target.label, { exact })
  if ('testId' in target) return page.getByTestId(target.testId)
  return page.locator(target.css)
}

async function eventually(check, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  do {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  } while (Date.now() < deadline)
  throw new Error(`Assertion failed: ${description}`)
}

function subset(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (actual === null || typeof actual !== 'object') return false
  if (Array.isArray(expected)) return Array.isArray(actual) && canonical(actual) === canonical(expected)
  return Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && subset(actual[key], value))
}

export async function assertExpectations(page, expectations, { readEvents, timeoutMs = 5000 } = {}) {
  validateExpectations(expectations)
  for (const assertion of expectations) {
    const target = assertion.target && resolveTarget(page, assertion.target)
    if (assertion.kind === 'visible' || assertion.kind === 'hidden') {
      await target.waitFor({ state: assertion.kind, timeout: timeoutMs })
    } else if (assertion.kind === 'text') {
      await eventually(async () => await target.count() === 1 && (await target.innerText()).trim() === assertion.value,
        `text equals ${JSON.stringify(assertion.value)}`, timeoutMs)
    } else if (assertion.kind === 'count') {
      await eventually(async () => await target.count() === assertion.value, `count equals ${assertion.value}`, timeoutMs)
    } else if (assertion.kind === 'url') {
      await eventually(() => page.url() === assertion.value, `URL equals ${assertion.value}`, timeoutMs)
    } else if (assertion.kind === 'event') {
      if (!readEvents) throw new Error('Event assertions require readEvents; refusing to skip them')
      await eventually(async () => {
        const events = await readEvents()
        if (!Array.isArray(events)) throw new Error('readEvents must return an array')
        const count = events.filter(event => event.eventType === assertion.name && subset(event.data, assertion.where ?? {})).length
        return 'count' in assertion ? count === assertion.count : count >= (assertion.minCount ?? 1)
      }, `event ${assertion.name} with payload ${JSON.stringify(assertion.where ?? {})}`, timeoutMs)
    }
  }
}

export async function executeStep(page, step, options = {}) {
  validateStep(step)
  if (step.action === 'checkpoint') throw new Error('Use captureCheckpoint for checkpoint steps')
  const startedAt = new Date().toISOString()
  const start = performance.now()
  const target = step.target && resolveTarget(page, step.target)
  const actionOptions = { timeout: step.timeoutMs ?? options.timeoutMs ?? 5000 }
  if (step.action === 'click') await target.click({ ...actionOptions, ...(step.position && { position: step.position }) })
  if (step.action === 'press') {
    if (target) await target.press(step.key, actionOptions)
    else await page.keyboard.press(step.key)
  }
  if (step.action === 'fill') await target.fill(step.value, actionOptions)
  if (step.action === 'check') await target.setChecked(step.checked, actionOptions)
  if (step.action === 'select') await target.selectOption(step.value, actionOptions)
  if (step.action === 'hover') await target.hover(actionOptions)
  if (step.action === 'waitFor') await target.waitFor({ ...actionOptions, state: step.state })
  return { action: step.action, startedAt, elapsedMs: Math.round(performance.now() - start) }
}
