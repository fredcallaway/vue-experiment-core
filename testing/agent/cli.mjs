#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { agentCommand, startAgentSession } from './client.mjs'

const help = `Persistent browser session for a testing agent.

  bun core/testing/agent/cli.mjs start --url http://localhost:3030/dev --output /tmp/experiment-session
  bun core/testing/agent/cli.mjs observe --session /tmp/experiment-session/session.json
  bun core/testing/agent/cli.mjs act --session <path> --json '{"action":"click","target":{"role":"button","name":"Continue"}}'
  bun core/testing/agent/cli.mjs checkpoint --session <path> --json '{"name":"instructions"}'
  bun core/testing/agent/cli.mjs finish --session <path> --json '{"summary":"Reached completion","terminal":[{"kind":"text","target":{"css":"h1"},"value":"Finished"}]}'
  bun core/testing/agent/cli.mjs compile --session <path> --json '{"reviewer":"testing-agent","rationale":"Reviewed every checkpoint image and completion evidence"}'
  bun core/testing/agent/cli.mjs stop --session <path>

Use --file <JSON path> instead of --json for larger payloads. Start accepts --seed, --label,
--scope full|section, --root-selector, --width, --height, --fast true|false and --idle-minutes. Inspect screenshot
files before approving compilation. The implementing agent should read handoff.json and handoff.md.`

function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!key.startsWith('--') || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Expected --option value, received ${key}`)
    }
    if (Object.hasOwn(values, key.slice(2))) throw new Error(`Repeated option ${key}`)
    values[key.slice(2)] = args[index + 1]
  }
  return values
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args
  if (!command || command === 'help' || command === '--help') return { help }
  const options = parseArgs(rest)
  const allowed = command === 'start'
    ? ['url', 'output', 'seed', 'label', 'scope', 'root-selector', 'width', 'height', 'fast', 'idle-minutes', 'json', 'file']
    : ['session', 'json', 'file']
  const unknown = Object.keys(options).find(key => !allowed.includes(key))
  if (unknown) throw new Error(`Unknown option --${unknown}`)
  if (options.json && options.file) throw new Error('Use either --json or --file')
  const payload = options.file ? JSON.parse(await readFile(options.file, 'utf8')) : JSON.parse(options.json || '{}')
  if (command === 'start') {
    return startAgentSession({
      ...payload,
      url: options.url || payload.url,
      output: options.output || payload.output,
      seed: options.seed || payload.seed,
      fast: options.fast === undefined ? payload.fast : parseBoolean(options.fast, '--fast'),
      rootSelector: options['root-selector'] || payload.rootSelector,
      scope: options.scope || options.label
        ? { kind: options.scope || payload.scope?.kind || 'section', label: options.label || options.scope }
        : payload.scope,
      viewport: options.width || options.height
        ? { width: Number(options.width || 1280), height: Number(options.height || 900) } : payload.viewport,
      idleMinutes: options['idle-minutes'] ? Number(options['idle-minutes']) : payload.idleMinutes,
    })
  }
  if (!options.session) throw new Error('--session is required')
  return agentCommand(options.session, command, payload)
}

function parseBoolean(value, name) {
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`)
  return value === 'true'
}

if (import.meta.main || fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.versions.bun) {
    const result = spawnSync('node', [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' })
    if (result.error) process.stderr.write(`Node.js is required for browser testing: ${result.error.message}\n`)
    process.exit(result.status ?? 1)
  }
  main().then(result => {
    if (result.help) process.stdout.write(`${result.help}\n`)
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`)
    process.exitCode = 1
  })
}
