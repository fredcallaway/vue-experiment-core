import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { inspectLayout } from '../visual/index.mjs'
import { assertExpectations, canonical, digest, validateStep } from './trace.mjs'

const infrastructureExclusions = [{
  selector: 'nuxt-devtools-frame',
  reason: 'Nuxt development toolbar includes nondeterministic startup timing outside the participant interface',
}]
const screenshotStyle = 'nuxt-devtools-frame { display: none !important; }'

async function readStructure(root, masks) {
  return root.evaluate((element, exclusions) => {
    const rootRect = element.getBoundingClientRect()
    const round = value => Math.round(value * 10) / 10
    const normalize = value => value.replace(/\s+/g, ' ').trim()
    const maskElements = exclusions.map(mask => document.querySelector(mask.selector))
    const elements = [element, ...element.querySelectorAll('*')]
    return {
      bounds: { x: round(rootRect.x), y: round(rootRect.y), width: round(rootRect.width), height: round(rootRect.height) },
      nodes: elements.flatMap(node => {
        if (maskElements.some(mask => mask.contains(node))) return []
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) return []
        const text = normalize([...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE)
          .map(child => child.textContent).join(' '))
        const role = node.getAttribute('role')
        const tag = node.tagName.toLowerCase()
        if (!text && !role && !['input', 'button', 'select', 'textarea', 'img', 'svg', 'canvas'].includes(tag)) return []
        return [{
          tag, role, text,
          label: node.getAttribute('aria-label') ?? '',
          alt: node.getAttribute('alt') ?? '',
          value: 'value' in node ? String(node.value) : null,
          checked: 'checked' in node ? Boolean(node.checked) : null,
          disabled: 'disabled' in node ? Boolean(node.disabled) : null,
          box: {
            x: round(rect.x - rootRect.x), y: round(rect.y - rootRect.y),
            width: round(rect.width), height: round(rect.height),
          },
        }]
      }),
      masks: exclusions.map(({ selector, reason }) => {
        const rect = document.querySelector(selector).getBoundingClientRect()
        return { selector, reason, box: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) } }
      }),
    }
  }, masks)
}

async function validateMasks(root, masks) {
  return root.evaluate((element, exclusions) => {
    const boxes = exclusions.map(mask => {
      const matches = [...document.querySelectorAll(mask.selector)]
      if (matches.length !== 1) throw new Error(`Mask ${mask.selector} must match exactly one element`)
      const node = matches[0]
      if (node === element || !element.contains(node)) throw new Error('Masks must be descendants of the participant root')
      const controlSelector = 'button,input:not([type="hidden"]),select,textarea,a[href],[role="button"],'
        + '[role="checkbox"],[role="radio"],[role="slider"],[tabindex]:not([tabindex="-1"])'
      const controls = [node, ...node.querySelectorAll(controlSelector)]
      if (controls.some(control => control.matches(controlSelector)
        && !control.matches(':disabled,[aria-disabled="true"]'))) {
        throw new Error('Masks cannot cover enabled participant controls')
      }
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') {
        throw new Error(`Mask ${mask.selector} must be visible`)
      }
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    const edges = [...new Set(boxes.flatMap(box => [box.x, box.x + box.width]))].sort((a, b) => a - b)
    let unionArea = 0
    for (let index = 0; index < edges.length - 1; index++) {
      const x = edges[index], right = edges[index + 1]
      const intervals = boxes.filter(box => box.x < right && box.x + box.width > x)
        .map(box => [box.y, box.y + box.height]).sort((a, b) => a[0] - b[0])
      let end = -Infinity, height = 0
      for (const [top, bottom] of intervals) {
        height += Math.max(0, bottom - Math.max(top, end))
        end = Math.max(end, bottom)
      }
      unionArea += (right - x) * height
    }
    const root = element.getBoundingClientRect()
    const rootArea = Math.max(0, Math.min(innerWidth, root.right) - Math.max(0, root.left))
      * Math.max(0, Math.min(innerHeight, root.bottom) - Math.max(0, root.top))
    if (unionArea > Math.min(rootArea, innerWidth * innerHeight) * 0.4) {
      throw new Error('Masks may cover at most 40% of the visible participant root and viewport')
    }
    return { boxes, area: unionArea, rootFraction: unionArea / rootArea, viewportFraction: unionArea / (innerWidth * innerHeight) }
  }, masks)
}

async function settleFiniteAnimations(page, timeoutMs) {
  return page.evaluate(async timeout => {
    const started = performance.now()
    const deadline = started + timeout
    let waited = 0
    const frames = () => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
    const infrastructure = target => {
      for (let node = target; node; node = node.parentElement ?? node.getRootNode?.().host) {
        if (node.localName === 'nuxt-devtools-frame') return true
      }
      return false
    }
    await frames()
    while (true) {
      const animations = document.getAnimations().filter(animation => {
        const timing = animation.effect?.getComputedTiming()
        return (animation.playState === 'running' || animation.pending)
          && Number.isFinite(timing?.endTime) && !infrastructure(animation.effect?.target)
      })
      if (!animations.length) return { waited, elapsedMs: Math.round(performance.now() - started) }
      waited += animations.length
      const remaining = deadline - performance.now()
      if (remaining <= 0) throw new Error('Finite animations did not settle before the checkpoint timeout')
      let timer
      try {
        await Promise.race([
          Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Finite animations did not settle before the checkpoint timeout')), remaining)
          }),
        ])
      } finally { clearTimeout(timer) }
      await frames()
    }
  }, timeoutMs)
}

export async function captureCheckpoint(page, step, {
  rootSelector = '.main-content', outputDir, readEvents, captureExtras, timeoutMs = 5000,
} = {}) {
  validateStep(step)
  if (step.action !== 'checkpoint') throw new Error('captureCheckpoint requires a checkpoint step')
  if (!outputDir) throw new Error('captureCheckpoint requires outputDir to preserve review evidence')
  const timeout = step.timeoutMs ?? timeoutMs
  await assertExpectations(page, step.assertions ?? [], { readEvents, timeoutMs: timeout })
  const root = page.locator(rootSelector)
  await root.waitFor({ state: 'visible', timeout })
  const masks = step.masks ?? []
  await page.evaluate(async (fontTimeout) => {
    if (document.fonts) {
      let timer
      try {
        await Promise.race([
          document.fonts.ready,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fonts did not settle')), fontTimeout) }),
        ])
      } finally { clearTimeout(timer) }
    }
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
  }, timeout)
  const animationSettling = await settleFiniteAnimations(page, timeout)
  const deadline = Date.now() + timeout
  let previous = null
  let stable = null
  do {
    const maskCoverage = await validateMasks(root, masks)
    const layout = await inspectLayout(page, { rootSelector })
    const structure = await readStructure(root, masks)
    const screenshot = await page.screenshot({ fullPage: false, animations: 'allow', caret: 'hide', timeout,
      style: screenshotStyle, mask: masks.map(mask => page.locator(mask.selector)) })
    const structureAfter = await readStructure(root, masks)
    const candidate = { structure, structureHash: digest(structure), screenshot, screenshotHash: digest(screenshot),
      layout, maskCoverage }
    if (candidate.structureHash === digest(structureAfter)
      && previous?.structureHash === candidate.structureHash && previous?.screenshotHash === candidate.screenshotHash) {
      stable = candidate
      break
    }
    previous = candidate
  } while (Date.now() < deadline)
  if (!stable) throw new Error(`Checkpoint ${step.name} did not stabilize; timed or animated states need agent review`)
  await mkdir(outputDir, { recursive: true })
  const screenshotPath = resolve(join(outputDir, `${step.name}.png`))
  await writeFile(screenshotPath, stable.screenshot)
  const viewportPath = resolve(join(outputDir, `${step.name}-viewport.png`))
  await page.screenshot({ path: viewportPath, fullPage: false, animations: 'allow', caret: 'hide', timeout })
  const result = {
    name: step.name, structure: stable.structure, structureHash: stable.structureHash,
    screenshotPath, screenshotHash: stable.screenshotHash,
    layout: stable.layout,
    viewportPath,
    infrastructureExclusions,
    animationSettling,
    ...(masks.length && { masks, maskCoverage: stable.maskCoverage }),
  }
  if (captureExtras) {
    result.extras = await captureExtras(page)
    canonical(result.extras)
    result.extrasHash = digest(result.extras)
  }
  return result
}

export async function compareCheckpoint(actual, expected, {
  outputDir, pixelThreshold = 0, maxDiffPixels = 0,
} = {}) {
  if (pixelThreshold !== 0 || maxDiffPixels !== 0) {
    throw new Error('Perceptual or blanket pixel tolerances are unsupported; use reviewed narrow masks')
  }
  const failures = []
  if (actual.name !== expected.name) failures.push({ kind: 'checkpoint-name', expected: expected.name, actual: actual.name })
  if (digest(actual.structure) !== expected.structureHash || digest(expected.structure) !== expected.structureHash) {
    failures.push({ kind: 'structure', message: 'Visible text, geometry, or interactive state changed' })
  }
  if ('extrasHash' in expected || 'extrasHash' in actual) {
    if (!('extras' in actual) || !('extras' in expected)
      || digest(actual.extras) !== expected.extrasHash || digest(expected.extras) !== expected.extrasHash) {
      failures.push({ kind: 'semantic', message: 'Checkpoint semantic state or event payload changed' })
    }
  }
  const [actualBytes, expectedBytes] = await Promise.all([readFile(actual.screenshotPath), readFile(expected.screenshotPath)])
  if (digest(expectedBytes) !== expected.screenshotHash) throw new Error('Baseline screenshot integrity check failed')
  if (digest(actualBytes) !== actual.screenshotHash) throw new Error('Actual screenshot integrity check failed')
  const actualPng = PNG.sync.read(actualBytes)
  const expectedPng = PNG.sync.read(expectedBytes)
  let diffPixels = 0
  let rawDiffPixels = 0
  let suppressedPixels = 0
  let maxChannelDelta = 0
  let diffPath
  if (actualPng.width !== expectedPng.width || actualPng.height !== expectedPng.height) {
    failures.push({ kind: 'visual', message: 'Screenshot dimensions changed',
      actual: [actualPng.width, actualPng.height], expected: [expectedPng.width, expectedPng.height] })
  } else {
    const diff = new PNG({ width: actualPng.width, height: actualPng.height })
    pixelmatch(actualPng.data, expectedPng.data, diff.data, actualPng.width, actualPng.height, {
      threshold: 0, includeAA: true,
    })
    for (let offset = 0; offset < actualPng.data.length; offset += 4) {
      let pixelDelta = 0
      for (let channel = 0; channel < 4; channel++) {
        pixelDelta = Math.max(pixelDelta, Math.abs(actualPng.data[offset + channel] - expectedPng.data[offset + channel]))
      }
      if (pixelDelta) rawDiffPixels++
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta)
    }
    if (rawDiffPixels <= 20 && maxChannelDelta <= 1) suppressedPixels = rawDiffPixels
    diffPixels = rawDiffPixels - suppressedPixels
    if (diffPixels > 0) {
      failures.push({ kind: 'visual', message: `${diffPixels} pixels changed`, diffPixels })
      if (outputDir) {
        await mkdir(outputDir, { recursive: true })
        diffPath = resolve(join(outputDir, `${actual.name}-diff.png`))
        await writeFile(diffPath, PNG.sync.write(diff))
      }
    }
  }
  return { name: actual.name, matched: !failures.length, failures, diffPixels, rawDiffPixels, suppressedPixels,
    maxChannelDelta, ...(diffPath && { diffPath }) }
}
