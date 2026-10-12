import { test, expect } from 'claude-code/testing'

import type { Pet } from '../types'
import { cellsOf, doing, labels, meter, pose, shown, step, tick, toBlocks, zzz } from './register'

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

test('a hat sits on the head, and comes off for a jump', async () => {
  const hatted = pose({ ...PET, act: 'look', hat: 0 })
  expect(hatted.slice(0, 2).join('')).toContain('y')
  expect(pose({ ...PET, act: 'look' }).slice(0, 2).join('')).not.toContain('y')
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

test('each spawned agent gets its own Clawd in its own colour', async ($, on) => {
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await $.agent.spawn({
    tool_use_id: 't1', prompt: 'look around', description: 'Find bugs', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'opus', background: true, fork: false,
  })
  const ui = await $.ui.mount({ plugin: 'clawd-pet', surface: 'desktop', ...BAND })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(source).toContain('fill="#5b9bd5"')
  expect(source).toContain('Find bugs')
  await ui.unmount()
})

test("a sleeping Clawd puffs a staircase of z's past his name tag", async () => {
  const asleep = labels({ ...PET, act: 'sleep', frame: 23 }, 10, 40)
  expect(asleep.map(l => [l.row, l.col, l.text])).toEqual([[0, 11, 'Claude'], [2, 19, 'z'], [1, 20, 'z'], [0, 21, 'Z']])
  expect(zzz({ ...PET, act: 'sleep', frame: 23 }, 35, 40).every(z => z.col < 35)).toBe(true)
})

test('Clawd is drawn on top of the prompt box', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'clawd-pet', surface, ...BAND })
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
  expect(meter({ ctx: 0 })).toBe('ctx: 0%')
  expect(meter({})).toBe('')
  await $.session.measure({ context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 17.4 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount({ plugin: 'clawd-pet', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /ctx: 42% session: 17%/ })).toBeDefined()
  await ui.unmount()
})
