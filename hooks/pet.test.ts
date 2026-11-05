import { test, expect } from 'claude-code/testing'

import type { Pet } from '../types'
import { cellsOf, doing, labels, merge, meter, newcomer, pose, usageOf, shown, step, tick, toBlocks, zzz } from './register'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 40, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const PET: Pet = { x: 0, dir: 1, act: 'run', left: 99, frame: 1, say: '', sayLeft: 0, idle: 0, busy: false, color: '#d77757', name: 'Claude', style: 0, hat: -1 }

test('the standing pose is the welcome-screen logo', async () => {
  const logo = ['...XXXXXXXXXXXX...', '...XX.XXXXXX.XX...', '.XXXXXXXXXXXXXXXX.', '...XXXXXXXXXXXX...', '....X.X....X.X....', '..................']
  expect(toBlocks(logo)).toEqual([' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '])
})

test('Clawd runs to the wall and turns around', async () => {
  expect(step({ ...PET, x: 10 }, 20)).toMatchObject({ x: 11, dir: -1 })
  expect(step({ ...PET, x: 11 }, 20)).toMatchObject({ x: 11, dir: -1 })
  expect(step({ ...PET, x: 0, dir: -1 }, 20)).toMatchObject({ x: 0, dir: 1 })
})

test('Clawd falls asleep when nothing happens', async () => {
  expect(step({ ...PET, act: 'sit', left: 1, idle: 99999 }, 20).act).toBe('sleep')
  expect(step({ ...PET, act: 'sleep', left: -5, idle: 99999 }, 20).act).toBe('sleep')
})

test('Clawd thinks while Claude works and wanders once it is done', async () => {
  expect(step({ ...PET, act: 'run', left: 1, busy: true }, 20).act).toBe('think')
  expect(step({ ...PET, act: 'jump', left: 1, busy: false }, 20).act).not.toBe('think')
})

test('an activity holds for as long as its tool call runs', async () => {
  expect(step({ ...PET, act: 'read', left: 1, busy: true, inTool: true }, 20, 50).act).toBe('read')
})

test('agents act out what their tools do', async () => {
  expect(['Read', 'Edit', 'Bash', 'WebSearch', 'Agent', 'TodoWrite', 'navigate', 'Mystery'].map(doing)).toEqual([
    'read', 'edit', 'bash', 'web', 'spawn', 'plan', 'web', 'run',
  ])
  expect(cellsOf(pose({ ...PET, act: 'read' })).flat().some(c => c.ink === 'w')).toBe(true)
  expect(cellsOf(pose({ ...PET, act: 'bash' })).flat().some(c => c.ink === 'k')).toBe(true)
})

test('a buddy grows a rounder head and its own ears, and keeps them for a jump', async () => {
  const buddy = pose({ ...PET, act: 'look', hat: 0 })
  expect(buddy.slice(0, 2).join('')).toContain('X')
  expect(buddy[2]).toBe('....XXXXXXXXXX....')
  expect(pose({ ...PET, act: 'look' }).slice(0, 2).join('')).not.toContain('X')
  expect(pose({ ...PET, act: 'look' })[2]).toBe('...XXXXXXXXXXXX...')
  expect(pose({ ...PET, act: 'jump', hat: 0 })[0]).toBe('....XX......XX....')
})

test('a full band of buddies never wears the same look twice', async () => {
  const all: Record<string, Pet> = { main: PET }
  for (let i = 0; i < 16; i++) all[`a${i}`] = newcomer(all, `agent ${i}`, 0)
  const buddies = Object.values(all).filter(p => p.hat >= 0)
  expect(new Set(buddies.map(p => p.color)).size).toBe(8)
  expect(new Set(buddies.map(p => `${p.color}${p.hat}`)).size).toBe(16)
  expect(new Set(buddies.slice(0, 8).map(p => p.hat)).size).toBe(8)
})

test("a subagent's Clawd says goodbye, then leaves", async () => {
  const bye = step({ ...PET, act: 'jump', left: 1, bye: true }, 20)
  expect(bye).toMatchObject({ act: 'jump', left: 0 })
  expect(Object.keys(tick({ main: PET, a1: bye }, 20))).toEqual(['main'])
  expect(Object.keys(tick({ main: { ...PET, idle: 99999 }, a2: { ...PET, idle: 6000 } }, 20))).toEqual(['main'])
  expect(Object.keys(tick({ main: PET, a3: { ...PET, idle: 6000, inTool: true } }, 20))).toEqual(['main', 'a3'])
})

test('Clawds that bump into each other scoot apart', async () => {
  const start = { main: { ...PET, act: 'sit' as const, x: 20 }, a1: { ...PET, act: 'walk' as const, x: 22, dir: -1, name: 'Godot game' } }
  let all = tick(start, 80)
  expect(all.a1).toMatchObject({ dir: 1 })
  for (let i = 0; i < 40; i++) all = tick(all, 80)
  expect(Math.abs(all.a1!.x - all.main!.x)).toBeGreaterThanOrEqual(13)
})

test('a workflow-sized crowd settles: no more than fit are drawn, and they stop moving', async () => {
  let all: Record<string, Pet> = { main: { ...PET, act: 'sit', left: 99999 } }
  for (let i = 0; i < 16; i++) all[`a${i}`] = { ...PET, act: 'sit', left: 99999, x: (i * 7) % 70, idle: i, name: `agent ${i}` }
  expect(shown(all, 80).size).toBe(8)
  for (let i = 0; i < 400; i++) all = tick(all, 80)
  const before = JSON.stringify(Object.values(all).map(p => p.x))
  for (let i = 0; i < 40; i++) all = tick(all, 80)
  expect(JSON.stringify(Object.values(all).map(p => p.x))).toBe(before)
})

test('drawn Clawds never overlap, however a full band churns', async () => {
  const acts = ['walk', 'sit', 'think', 'bash', 'read'] as const
  let all: Record<string, Pet> = { main: { ...PET, act: 'walk', left: 99999, x: 30 } }
  for (let i = 0; i < 9; i++) all[`a${i}`] = { ...PET, act: acts[i % acts.length]!, left: 99999, busy: true, x: (i * 11) % 70, idle: i, name: `verify:${i}`, dir: i % 2 ? 1 : -1, style: i % 3 }
  for (let t = 0; t < 3000; t++) {
    // a tool call somewhere: a hidden Clawd comes back in, wherever it last stood
    const id = `a${Math.floor(Math.random() * 9)}`
    all = tick({ ...all, [id]: { ...all[id]!, idle: 0 } }, 80)
    const xs = [...shown(all, 80)].map(k => all[k]!.x).sort((a, b) => a - b)
    xs.forEach((x, i) => i && expect(x - xs[i - 1]!).toBeGreaterThanOrEqual(9))
  }
})

test('a walker turns back from a sitting Clawd instead of shoving it along', async () => {
  let all: Record<string, Pet> = { main: { ...PET, act: 'sit', left: 99999, x: 40 }, a1: { ...PET, act: 'walk', left: 99999, x: 20, name: 'walker' } }
  for (let i = 0; i < 2000; i++) all = tick(all, 80)
  expect(all.main!.x).toBe(40)
})

test('each spawned agent gets its own Clawd in its own colour', async ($, on) => {
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await $.agent.spawn({
    tool_use_id: 't1', prompt: 'look around', description: 'Find bugs', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: true, fork: false,
  })
  const ui = await $.ui.mount({ plugin: 'nekoclaude', surface: 'desktop', ...BAND })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('fill="#6e9ec7"')
  expect(source).toContain('Find bugs')
  await ui.unmount()
})

test("a workflow agent with no loop id still gets a Clawd", async ($, on) => {
  on('agent.spawn', () => ({ model: 'sonnet' }))
  await $.agent.spawn({
    tool_use_id: 't2', prompt: 'build it', description: 'S:finish', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: true, fork: false,
    workflow: { runId: 'wf_abc123', agentIndex: 1 },
  })
  const ui = await $.ui.mount({ plugin: 'nekoclaude', surface: 'desktop', ...BAND })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('S:finish')
  await ui.unmount()
})

test("a sleeping Clawd puffs a staircase of z's past his name tag", async () => {
  const asleep = labels({ ...PET, act: 'sleep', frame: 23 }, 10, 40)
  expect(asleep.map(l => [l.row, l.col, l.text])).toEqual([[0, 11, 'Claude'], [2, 19, 'z'], [1, 20, 'z'], [0, 21, 'Z']])
  expect(zzz({ ...PET, act: 'sleep', frame: 23 }, 35, 40).every(z => z.col < 35)).toBe(true)
})

test('Clawd is drawn on top of the prompt box', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'nekoclaude', surface, ...BAND })
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /█/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Claude' })).toBeDefined()
    } else {
      expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('>Claude</text>')
    }
    await ui.unmount()
  }
})

test('the meter shows context and 5-hour use, leaving out what has no reading', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  expect(meter({ ctx: 42, session: 17 })).toBe('ctx: 42% session: 17%')
  expect(meter({ ctx: 0 })).toBe('ctx: 0% session: --%')
  expect(meter({})).toBe('ctx: --% session: --%')
  const m = { context: { percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 17.4 }, { kind: 'seven_day', percentUsed: 30.2 }, { kind: 'spend_limit', percentUsed: 8 }], cost: { usd: 1.2 } }
  expect(meter(usageOf(m, true))).toBe('ctx: 42% session: 17% wk: 30% credits: 8% cloud: $1.20')
  expect(meter(usageOf(m, false))).toBe('ctx: 42% session: 17% wk: 30% credits: 8%')
  expect(meter(merge({ ctx: 42, session: 17 }, usageOf({ context: {}, rateLimits: [] }, false)))).toBe('ctx: 42% session: 17%')
  await $.session.measure({ context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 17.4 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount({ plugin: 'nekoclaude', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /ctx: 42% session: 17%/ })).toBeDefined()
  await ui.unmount()
})
