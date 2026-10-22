import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Inspect a settled participant view without clicking, scrolling, or changing styles.
 * This catches geometric failures even in a previously unreviewed screenshot. It
 * cannot judge stimulus correctness, canvas pixels, or visual design; review the
 * screenshot as well. Scrollable content and disabled controls are not failures.
 */
export async function inspectLayout(page, options = {}) {
  const started = performance.now()
  const result = await page.evaluate((settings) => {
    const { rootSelector, ignoreSelectors, tolerance, maxElements, checkText, requireInViewport } = settings
    const viewport = { x: 0, y: 0, width: innerWidth, height: innerHeight }
    const findings = []
    const controls = []
    const styleCache = new Map()
    const style = (element) => {
      if (!styleCache.has(element)) styleCache.set(element, getComputedStyle(element))
      return styleCache.get(element)
    }
    const rect = (box) => ({
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
    })
    const area = (box) => Math.max(0, box.width) * Math.max(0, box.height)
    const intersection = (first, second, x = true, y = true) => {
      const left = x ? Math.max(first.x, second.x) : first.x
      const top = y ? Math.max(first.y, second.y) : first.y
      const right = x ? Math.min(first.x + first.width, second.x + second.width) : first.x + first.width
      const bottom = y ? Math.min(first.y + first.height, second.y + second.height) : first.y + first.height
      return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
    }
    const clips = (value) => ['hidden', 'clip', 'auto', 'scroll'].includes(value)
    const scrolls = (value) => ['auto', 'scroll'].includes(value)
    const outside = (box, bounds, x = true, y = true) => (
      (x && (box.x < bounds.x - tolerance || box.x + box.width > bounds.x + bounds.width + tolerance))
      || (y && (box.y < bounds.y - tolerance || box.y + box.height > bounds.y + bounds.height + tolerance))
    )
    const ignored = (element) => ignoreSelectors.some((selector) => element.closest(selector))
    const rendered = (element) => {
      if (ignored(element)) return false
      for (let node = element; node; node = node.parentElement) {
        const css = style(node)
        if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) return false
      }
      return [...element.getClientRects()].some((box) => box.width > 0 && box.height > 0)
    }
    const selector = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`
      for (const attribute of ['data-testid', 'data-test', 'name']) {
        const value = element.getAttribute(attribute)
        if (value) {
          const candidate = `${element.localName}[${attribute}=${JSON.stringify(value)}]`
          if (document.querySelectorAll(candidate).length === 1) return candidate
        }
      }
      const parts = []
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        if (node === root) {
          parts.unshift(rootSelector)
          break
        }
        const siblings = node.parentElement ? [...node.parentElement.children] : []
        const sameTag = siblings.filter((sibling) => sibling.localName === node.localName)
        const suffix = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(node) + 1})` : ''
        parts.unshift(`${node.localName}${suffix}`)
      }
      return parts.join(' > ')
    }
    const label = (element) => (
      element.getAttribute('aria-label') || element.getAttribute('alt') || element.innerText || ''
    ).trim().replace(/\s+/g, ' ').slice(0, 180)
    const report = (element, kind, severity, message, evidence = {}, box = element.getBoundingClientRect()) => {
      findings.push({
        kind, severity, selector: selector(element), label: label(element), message, rect: rect(box), evidence,
      })
    }
    const roots = [...document.querySelectorAll(rootSelector)].filter(rendered)
    const root = roots[0]
    if (!root) {
      return {
        rootSelector, viewport, root: null, controls, inspectedElements: 0,
        findings: [{ kind: 'missing-root', severity: 'error', selector: rootSelector,
          message: 'No visible experiment root matched. Confirm navigation and the root selector.' }],
      }
    }
    if (roots.length > 1) {
      report(root, 'ambiguous-root', 'error', `${roots.length} visible roots matched; scope the audit to one.`, {
        count: roots.length,
      })
    }
    const allElements = [root, ...root.querySelectorAll('*')]
    const elements = allElements.slice(0, maxElements).filter(rendered)
    if (allElements.length > maxElements) {
      report(root, 'incomplete-audit', 'error', 'Element limit reached; remaining content was not inspected.', {
        totalElements: allElements.length, maxElements,
      })
    }
    const controlSelector = 'button,input:not([type="hidden"]),select,textarea,a[href],'
      + '[role="button"],[role="checkbox"],[role="radio"],[role="slider"],[tabindex]:not([tabindex="-1"])'
    const disabled = (element) => element.matches(':disabled,[aria-disabled="true"]')
      || Boolean(element.closest('[inert],[aria-disabled="true"]'))
    const clippingBounds = (element, includeSelf = false) => {
      const bounds = []
      for (let node = includeSelf ? element : element.parentElement; node; node = node.parentElement) {
        const css = style(node)
        if (clips(css.overflowX) || clips(css.overflowY)) {
          const box = node.getBoundingClientRect()
          const scaleX = node.offsetWidth ? box.width / node.offsetWidth : 1
          const scaleY = node.offsetHeight ? box.height / node.offsetHeight : 1
          bounds.push({
            element: node,
            box: { x: box.x + node.clientLeft * scaleX, y: box.y + node.clientTop * scaleY,
              width: node.clientWidth * scaleX, height: node.clientHeight * scaleY },
            x: clips(css.overflowX), y: clips(css.overflowY),
            scrollX: scrolls(css.overflowX), scrollY: scrolls(css.overflowY),
          })
        }
      }
      return bounds
    }
    const clippingFailure = (box, bounds) => {
      let visible = box
      for (const bound of bounds) {
        if (outside(visible, bound.box, bound.x && !bound.scrollX, bound.y && !bound.scrollY)) return bound
        // Outer clipping applies to the scrollport, not all of its offscreen
        // content. An instruction paragraph below a scrollport is reachable.
        visible = intersection(visible, bound.box, bound.scrollX, bound.scrollY)
        if (area(visible) === 0) return null
      }
      return null
    }
    const scrollReachable = (element, box, bounds) => {
      for (let node = element; node; node = node.parentElement) {
        if (style(node).position === 'fixed') return !outside(box, viewport)
      }
      const page = document.scrollingElement
      const htmlCss = style(document.documentElement)
      const bodyCss = style(document.body)
      const pageOverflowX = htmlCss.overflowX === 'visible' ? bodyCss.overflowX : htmlCss.overflowX
      const pageOverflowY = htmlCss.overflowY === 'visible' ? bodyCss.overflowY : htmlCss.overflowY
      const scrollX = bounds.some((bound) => bound.scrollX)
        || (page && page.scrollWidth > innerWidth && !['hidden', 'clip'].includes(pageOverflowX))
      const scrollY = bounds.some((bound) => bound.scrollY)
        || (page && page.scrollHeight > innerHeight && !['hidden', 'clip'].includes(pageOverflowY))
      // Content before the start of a scroll range is not reachable merely
      // because unrelated content makes that axis scrollable.
      const availableLeft = (page?.scrollLeft ?? 0)
        + bounds.reduce((sum, bound) => sum + (bound.scrollX ? bound.element.scrollLeft : 0), 0)
      const availableTop = (page?.scrollTop ?? 0)
        + bounds.reduce((sum, bound) => sum + (bound.scrollY ? bound.element.scrollTop : 0), 0)
      if (box.x + availableLeft < -tolerance || box.y + availableTop < -tolerance) return false
      return !outside(box, viewport, !scrollX, !scrollY)
    }
    for (const element of elements) {
      const box = element.getBoundingClientRect()
      const bounds = clippingBounds(element)
      const isControl = element.matches(controlSelector)
      const isDisabled = isControl && disabled(element)
      if (isControl) {
        controls.push({ selector: selector(element), label: label(element), disabled: isDisabled, rect: rect(box) })
      }

      // A clipped container is not itself a defect: inspect its actual text,
      // media and enabled controls instead, avoiding duplicate wrapper reports.
      const media = element.matches('img,canvas,svg,video')
      if ((isControl && !isDisabled) || media) {
        const clipped = clippingFailure(box, bounds)
        if (clipped) {
          report(element, 'clipped-content', 'error', 'Content extends beyond a non-scrollable clipping ancestor.', {
            ancestor: selector(clipped.element), ancestorRect: rect(clipped.box),
          })
        } else if (outside(box, viewport) && (requireInViewport || !scrollReachable(element, box, bounds))) {
          report(element, 'offscreen-content', 'error', 'Content cannot be scrolled fully into the viewport.', {
            viewport, requireInViewport,
          })
        }
      }
      const css = style(element)
      const paintedContainer = !isControl && !media && element.children.length > 0
        && (css.backgroundImage !== 'none'
          || !['rgba(0, 0, 0, 0)', 'transparent'].includes(css.backgroundColor)
          || ['Top', 'Right', 'Bottom', 'Left'].some((side) => Number.parseFloat(css[`border${side}Width`]) > 0))
      if (paintedContainer) {
        const clipped = clippingFailure(box, bounds)
        if (clipped) {
          report(element, 'clipped-container', 'review', 'A painted container extends beyond a clipping ancestor.', {
            ancestor: selector(clipped.element), ancestorRect: rect(clipped.box),
          })
        } else if (outside(box, viewport) && (requireInViewport || !scrollReachable(element, box, bounds))) {
          report(element, 'offscreen-container', 'review', 'A painted container extends beyond the visible viewport.')
        }
      }
      if (element.matches('img[src],img[srcset]') && element.complete && element.naturalWidth === 0) {
        report(element, 'broken-image', 'error', 'An image failed to decode or load.', {
          source: element.currentSrc || element.getAttribute('src'),
        })
      }
      if (isControl && !isDisabled && area(intersection(box, viewport)) > 0) {
        let visible = intersection(box, viewport)
        for (const bound of bounds) visible = intersection(visible, bound.box, bound.x, bound.y)
        if (visible.width > tolerance * 2 && visible.height > tolerance * 2) {
          const blocked = []
          const points = [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => ({
            x: visible.x + visible.width * x, y: visible.y + visible.height * y,
          })))
          for (const point of points) {
            const hit = document.elementFromPoint(point.x, point.y)
            if (hit && hit !== element && !element.contains(hit)) blocked.push({ ...point, blocker: selector(hit) })
          }
          if (blocked.length === points.length) {
            report(element, 'occluded-control', 'error', 'No sampled point on this control receives pointer input.', {
              blocked, sampledPoints: points.length, pointerEvents: style(element).pointerEvents,
            })
          } else if (blocked.length >= 5 || blocked.some((point) => (
            point.x === points[4].x && point.y === points[4].y
          ))) {
            report(element, 'partially-occluded-control', 'review', 'The center or most control points are covered.', {
              blocked, sampledPoints: points.length,
            })
          }
        }
      }
      if (!checkText || isDisabled || element.closest('svg,canvas,script,style,textarea,select')) continue
      if (css.textOverflow === 'ellipsis' || Number.parseInt(css.webkitLineClamp, 10) > 0) continue
      const textNodes = [...element.childNodes].filter((node) => (
        node.nodeType === Node.TEXT_NODE && node.textContent.trim()
      ))
      const textBounds = clippingBounds(element, true)
      for (const textNode of textNodes) {
        const range = document.createRange()
        range.selectNodeContents(textNode)
        const boxes = [...range.getClientRects()].filter((textBox) => area(textBox) > 0)
        const clippedText = boxes.find((textBox) => clippingFailure(textBox, textBounds))
        if (clippedText) {
          const clipped = clippingFailure(clippedText, textBounds)
          report(element, 'clipped-text', 'error', 'Text extends beyond a non-scrollable clipping ancestor.', {
            text: textNode.textContent.trim().slice(0, 180),
            ancestor: selector(clipped.element), ancestorRect: rect(clipped.box),
          }, clippedText)
          break
        }
      }
    }
    return {
      rootSelector, viewport, root: rect(root.getBoundingClientRect()), controls,
      inspectedElements: elements.length, findings,
    }
  }, {
    rootSelector: options.rootSelector ?? '.main-content',
    ignoreSelectors: options.ignoreSelectors ?? [],
    tolerance: options.tolerance ?? 2,
    maxElements: options.maxElements ?? 2500,
    checkText: options.checkText ?? true,
    requireInViewport: options.requireInViewport ?? false,
  })
  return { ...result, elapsedMs: Math.round((performance.now() - started) * 10) / 10 }
}

/** Capture the viewport without scrolling a target into view or finishing animations. */
export async function captureVisualEvidence(page, options = {}) {
  const started = performance.now()
  if (options.path) await mkdir(dirname(options.path), { recursive: true })
  const bytes = await page.screenshot({
    path: options.path, fullPage: false, animations: 'allow', caret: 'hide', scale: 'css',
    timeout: options.timeout ?? 5000,
    ...(options.maskSelectors?.length ? {
      mask: options.maskSelectors.map((selector) => page.locator(selector)), maskColor: '#FF00FF',
    } : {}),
  })
  return {
    path: options.path ?? null,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    viewport: page.viewportSize(),
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
  }
}

/** Collect both machine findings and reviewable pixels at the current checkpoint. */
export async function inspectVisualState(page, options = {}) {
  const layout = await inspectLayout(page, options)
  const screenshot = await captureVisualEvidence(page, options)
  return { ...layout, screenshot }
}
