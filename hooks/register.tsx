import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Act, Clawds, Pet, Usage } from '../types'

const TICK_MS = 100
const ticks = (ms: number) => Math.round(ms / TICK_MS)
const SLEEP_TICKS = ticks(120_000) // 2 minutes with nothing happening
const ORPHAN_TICKS = ticks(600_000) // a subagent's Clawd silent this long (10 minutes) lost its agent
const MAIN = 'main' // the main loop's Clawd; each subagent's is keyed by its agentId
const START: Pet = { x: 0, dir: 1, act: 'walk', left: ticks(4000), frame: 0, say: '', sayLeft: 0, idle: 0, busy: false, color: '#d77757', name: 'Claude', style: 0, hat: -1 }
// The main Clawd naps until you start typing.
const MAIN_START: Pet = { ...START, act: 'sleep', left: 0 }
// Each subagent's Clawd takes the first colour no live Clawd wears.
const PALETTE = ['#5b9bd5', '#6abf69', '#b07cd8', '#e5b84b', '#e06c9f', '#4fbfb5']
// Prop colours, by the letter a pose paints them with; 'X' is the Clawd's own colour.
const INK: Record<string, string> = { w: '#f2efe6', y: '#f5c542', k: '#9a9a9a', g: '#7bd88f', c: '#9fd3ff', r: '#e5534b', d: '#1e2b22' }
const clawds = atom({ plugin: 'clawd-pet', key: 'clawds' } as const, { [MAIN]: MAIN_START } as Clawds)
const usage = atom({ plugin: 'clawd-pet', key: 'usage' } as const, {} as Usage)

// `ctx: 42% session: 17% credits: 8% cloud: $1.20`, leaving out whichever has no reading.
export const meter = (u: Usage) =>
  [
    u.ctx !== undefined && `ctx: ${u.ctx}%`,
    u.session !== undefined && `session: ${u.session}%`,
    u.credits !== undefined && `credits: ${u.credits}%`,
    u.usd !== undefined && `cloud: $${u.usd.toFixed(2)}`,
  ].filter(Boolean).join(' ')
type Measured = { context: { percent?: number }; rateLimits: { kind: string; percentUsed: number }[]; cost?: { usd: number } }
export const usageOf = (m: Measured, isCloud: boolean): Usage => {
  const used = (kind: string) => {
    const r = m.rateLimits.find(r => r.kind === kind)
    return r && Math.round(r.percentUsed)
  }
  return { ctx: m.context.percent, session: used('five_hour'), credits: used('spend_limit'), usd: isCloud ? m.cost?.usd : undefined }
}
// Claude Code on the web sets CLAUDE_CODE_REMOTE in its cloud sessions; read again on each load.
let isCloud = false

// Clawd's pixels: the welcome-screen logo taken apart into rows, 18 wide.
// LOOK, STEP and every prop face right; dir -1 mirrors every row.
const TOP = '...XXXXXXXXXXXX...'
const EYES = '...XX.XXXXXX.XX...'
const SHUT = '...X..XXXXXX..X...' // eyes closed: a flat slit under the brow
const LOOK = '...XXX.XXXXXX.X...'
const BACK = '...X.XXXXXX.XXX...'
const ARMS = '.XXXXXXXXXXXXXXXX.'
const DROOP = '..XXXXXXXXXXXXXX..'
const BODY = '...XXXXXXXXXXXX...'
const LEGS = '....X.X....X.X....'
const STEP = '...X.X....X.X.....'
const CHEER = '.X.XXXXXXXXXXXX.X.'
const CHEER_EYES = '.X.XXX.XXXXXX.X.X.'
const NONE = '..................'

// The world is 8 pixels tall (4 text rows); `at` drops a pose in at pixel row y.
const at = (y: number, rows: string[]) => [...Array<string>(y).fill(NONE), ...rows, ...Array<string>(8).fill(NONE)].slice(0, 8)

// Paints marks over a pose: [row, column, ink], where '.' in the ink leaves what is under it.
type Mark = [number, number, string]
const paint = (rows: string[], ...marks: Mark[]) =>
  rows.map((row, y) => {
    const cells = [...row]
    for (const [my, mx, ink] of marks) {
      if (my === y) [...ink].forEach((ch, i) => ch !== '.' && mx + i < cells.length && (cells[mx + i] = ch))
    }
    return cells.join('')
  })

// Which of n phases, each `period` ms long, time t falls in.
const ph = (t: number, period: number, n: number) => Math.floor(t / period) % n

// Hats, so agents can be told apart at a glance: two rows that sit on the head.
const HATS: [string, string][] = [
  ['........yy........', '.......yyyy.......'], // party hat
  ['......kkkkkk......', '....kkkkkkkkkk....'], // top hat
  ['........ww........', '.....rrrrrrrr.....'], // beanie
  ['.........y........', '.........k........'], // antenna
  ['......y.yy.y......', '......yyyyyy......'], // crown
  ['.........rr.rr....', '..........rrr.....'], // bow
]

const stand = (eyes = LOOK, legs = LEGS) => at(2, [TOP, eyes, ARMS, BODY, legs])

// Every pose, from the time in ms (so the tick rate never changes the pace) and the Clawd.
const POSES: Record<Act, (t: number, p: Pet) => string[]> = {
  walk: t => stand(LOOK, ph(t, 250, 2) ? STEP : LEGS),
  run: t => stand(LOOK, ph(t, 100, 2) ? STEP : LEGS),
  look: t => stand(ph(t, 1500, 2) ? BACK : LOOK),
  sit: t => at(4, [TOP, t % 5000 < 200 ? SHUT : LOOK, ARMS, BODY]),
  sleep: t => at(4, [TOP, SHUT, ph(t, 1000, 2) ? DROOP : ARMS, BODY]),
  jump: t => (ph(t, 250, 2) ? stand() : at(0, [CHEER, CHEER_EYES, ARMS, BODY, STEP])),
  sad: t => at(2, [TOP, t % 2500 < 500 ? SHUT : EYES, DROOP, BODY, LEGS]),
  // Thinking three ways: pacing (style 0), pondering on the spot (1), tapping a foot (2).
  think: (t, p) => stand(ph(t, 1200, 2) ? BACK : LOOK, p.style !== 1 && ph(t, p.style === 2 ? 150 : 400, 2) ? STEP : LEGS),
  // Reading: eyes run along the lines of an open book, then flick back.
  read: t => paint(stand(ph(t, 700, 3) === 2 ? BACK : LOOK), [4, 9, 'wwwkwww'], [5, 9, 'wwwkwww']),
  // Editing: a hammer swings up, then comes down in a shower of sparks.
  edit: t =>
    ph(t, 300, 2)
      ? paint(stand(), [0, 14, 'kkk'], [1, 15, 'k'], [2, 15, 'k'], [3, 15, 'k'])
      : paint(stand(), [5, 16, 'k'], [6, 15, 'kkk'], [7, 14, 'y..y']),
  // Running a command: typing at a little terminal.
  bash: t => paint(stand(), [4, 10, 'kkkkkkk'], [5, 10, ph(t, 200, 2) ? 'kggdgdk' : 'kgdggdk'], [6, 10, 'kkkkkkk']),
  // On the web: wandering about, sweeping a magnifying glass up and down.
  web: t => {
    const y = 1 + ph(t, 500, 2)
    return paint(stand(LOOK, ph(t, 250, 2) ? STEP : LEGS), [y, 13, '.cc.'], [y + 1, 13, 'c..c'], [y + 2, 13, '.cc.'], [y + 3, 16, 'k'], [y + 4, 17, 'k'])
  },
  // Handing work to other agents: arms up, sparkles.
  spawn: t =>
    paint(at(2, [CHEER, CHEER_EYES, ARMS, BODY, LEGS]), ...((ph(t, 300, 2) ? [[0, 1, 'y'], [1, 16, 'y']] : [[1, 1, 'y'], [0, 16, 'y']]) as Mark[])),
  // Planning: ticking off a checklist, one line at a time.
  plan: t => paint(stand(), ...[0, 1, 2].map((i): Mark => [4 + i, 12, `${ph(t, 500, 4) > i ? 'g' : 'k'}wwww`])),
}

export const pose = (p: Pet) => {
  let rows = POSES[p.act](p.frame * TICK_MS, p)
  const hat = HATS[p.hat]
  const head = rows.findIndex(r => r.includes('X'))
  if (hat && head >= 2) rows = paint(rows, [head - 2, 0, hat[0]], [head - 1, 0, hat[1]])
  return p.dir < 0 ? rows.map(r => [...r].reverse().join('')) : rows
}

// What an agent is up to, read off the tool it uses (an MCP tool by its own name).
const DOING: [RegExp, Act][] = [
  [/^(Agent|Task|Workflow|SendMessage|Skill)$/, 'spawn'],
  [/^(TodoWrite|EnterPlanMode|ExitPlanMode)$|^Task(Create|Update|List|Get)$|todo|plan/i, 'plan'],
  [/^Web(Search|Fetch)$|browser|chrome|navigate|http|fetch/i, 'web'],
  [/^(Edit|Write|MultiEdit|NotebookEdit)$|edit|write|update|create/i, 'edit'],
  [/^(Bash|PowerShell|Monitor)$|terminal|shell|process|exec|run/i, 'bash'],
  [/^(Read|Grep|Glob|LSP|ToolSearch|NotebookRead)$|read|search|find|list|get|query|view|screenshot/i, 'read'],
]
export const doing = (tool: string): Act => DOING.find(([re]) => re.test(tool))?.[1] ?? 'run'

// 2x2 pixels per cell, glyph indexed UL*8 + UR*4 + LL*2 + LR; a cell with any
// prop pixel takes the prop's ink. A pixel is twice as tall as wide in a
// terminal, so the SVG draws them 1x2 to match.
const QUADS = ' ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█'
export const cellsOf = (px: string[]) =>
  Array.from({ length: px.length / 2 }, (_, i) =>
    Array.from({ length: (px[0]?.length ?? 0) / 2 }, (_, c) => {
      const quad = [px[i * 2]?.[c * 2], px[i * 2]?.[c * 2 + 1], px[i * 2 + 1]?.[c * 2], px[i * 2 + 1]?.[c * 2 + 1]]
      const on = quad.map(q => (q !== undefined && q !== '.' ? 1 : 0))
      return { ch: QUADS[on[0]! * 8 + on[1]! * 4 + on[2]! * 2 + on[3]!]!, ink: quad.find(q => q !== undefined && q !== '.' && q !== 'X') ?? 'X' }
    }),
  )
export const toBlocks = (px: string[]) => cellsOf(px).map(row => row.map(c => c.ch).join(''))

const pick = <T,>(...xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo))

// What Clawd does between events: thinks while Claude works, otherwise wanders.
const wander = (busy: boolean, idle: number): Partial<Pet> =>
  busy
    ? { act: 'think', left: 1 }
    : idle > SLEEP_TICKS
    ? { act: 'sleep', say: '' }
    : pick<Partial<Pet>>(
        { act: 'walk', left: between(ticks(2000), ticks(8000)), dir: pick(1, -1) },
        { act: 'walk', left: between(ticks(2000), ticks(8000)) },
        { act: 'sit', left: between(ticks(4000), ticks(15000)) },
        { act: 'look', left: between(ticks(2000), ticks(4000)) },
      )

// How fast each act gets about, in ms per column; a thinking Clawd paces only in style 0.
const PACE: Partial<Record<Act, number>> = { walk: 500, run: 200, web: 450, think: 800 }

// `n` ticks of Clawd's life in a world `width` columns wide. An activity holds
// while its tool call runs.
export function step(p: Pet, width: number, n = 1): Pet {
  const s: Pet = { ...p, frame: p.frame + n, left: p.left - n, idle: p.idle + n, sayLeft: p.sayLeft - n }
  if (s.sayLeft <= 0) s.say = ''
  if (s.left <= 0 && s.act !== 'sleep' && !s.bye && !s.inTool) Object.assign(s, wander(s.busy, s.idle))
  const pace = s.act === 'think' && s.style !== 0 ? undefined : PACE[s.act]
  if (pace && Math.floor((s.frame * TICK_MS) / pace) !== Math.floor((p.frame * TICK_MS) / pace)) s.x += s.dir
  const max = Math.max(0, width - 9)
  if (s.x <= 0 && s.dir < 0) s.dir = 1
  if (s.x >= max && s.dir > 0) s.dir = -1
  s.x = Math.min(Math.max(s.x, 0), max)
  return s
}

// How far apart two Clawds keep: room for both bodies, and for both name tags side by side.
const spacing = (p: Pet, q: Pet) => Math.max(13, Math.ceil((p.name.length + q.name.length) / 2) + 2)

// Who gets drawn: main, then the most recently active subagents, as many as fit
// 10 columns each; the rest are counted in a "+N" at the end of the band.
export const shown = (all: Clawds, width: number) =>
  new Set(
    Object.entries(all)
      .sort(([a, p], [b, q]) => Number(b === MAIN) - Number(a === MAIN) || p.idle - q.idle)
      .slice(0, Math.max(1, Math.floor(width / 10)))
      .map(([id]) => id),
  )

// A Clawd stays this long with nothing heard before its agent counts as gone;
// six times longer while one of its tool calls is still running.
const isAlive = (id: string, p: Pet) => id === MAIN || p.idle < (p.inTool ? ORPHAN_TICKS * 6 : ORPHAN_TICKS)

// `n` ticks for everyone; a subagent's Clawd leaves once its goodbye is over or
// its agent has gone quiet. A drawn Clawd too close to another scoots a column
// away; a walker turns back, or stops when the band is too crowded to turn.
export function tick(all: Clawds, width: number, n = 1): Clawds {
  const kept = Object.entries(all)
    .filter(([id, p]) => !(p.bye && p.left <= 0) && isAlive(id, p))
    .map(([id, p]) => [id, step(p, width, n)] as const)
  const drawn = shown(Object.fromEntries(kept), width)
  const crowd = kept.filter(([id]) => drawn.has(id))
  const max = Math.max(0, width - 9)
  const room = Math.floor(max / Math.max(1, crowd.length - 1))
  return Object.fromEntries(
    kept.map(([id, p]) => {
      const near = drawn.has(id) && crowd.find(([other, q]) => other !== id && Math.abs(q.x - p.x) < Math.min(spacing(p, q), room))
      if (!near) return [id, p]
      const away = p.x === near[1].x ? (id < near[0] ? -1 : 1) : Math.sign(p.x - near[1].x)
      const isMoving = PACE[p.act] !== undefined
      const halt: Partial<Pet> = isMoving && room < 9 ? { act: p.busy ? 'think' : 'look', left: ticks(2000) } : {}
      return [id, { ...p, ...halt, x: Math.min(Math.max(p.x + away, 0), max), dir: isMoving ? away : p.dir }]
    }),
  )
}

// The band's width on each surface drawing it; the ticker walks the Clawds in the narrowest.
const widths: Record<string, number> = {}
const worldWidth = () => (Object.keys(widths).length ? Math.min(...Object.values(widths)) : 60)

// Ticks since the band last drew: a session nobody is looking at ticks once a
// second (ten ticks' worth at a time) instead of ten times.
let quiet = 0
function loop($: EngineInterface) {
  const isWatched = quiet <= 30
  $.clock.after(isWatched ? TICK_MS : 1000, () => {
    quiet += 1
    void update($, clawds, all => tick(all, worldWidth(), isWatched ? 1 : 10))
    loop($)
  })
}

// A subagent's Clawd hops out near its parent's, in the first colour and hat
// no live Clawd wears, with a way of thinking of its own.
const newcomer = (all: Clawds, name: string, near: number): Pet => {
  const hats = HATS.map((_, i) => i).filter(i => !Object.values(all).some(p => p.hat === i))
  return {
    ...START,
    name: name.length > 16 ? `${name.slice(0, 15)}…` : name,
    color: PALETTE.find(c => !Object.values(all).some(p => p.color === c)) ?? pick(...PALETTE),
    hat: hats.length ? pick(...hats) : between(0, HATS.length),
    style: between(0, 3),
    x: Math.max(0, near + between(-8, 9)),
    dir: pick(1, -1),
    act: 'run',
    left: ticks(3000),
    busy: true,
  }
}

// Set a Clawd's mood; `join` brings in an agent we never saw start (it started
// before this load, or as a retry) under a plain "agent" tag.
async function feel($: EngineInterface, id: string, ticksLeft: number, change: Partial<Pet>, join = false) {
  await update($, clawds, all => {
    const p = all[id] ?? (join && id !== MAIN ? newcomer(all, 'agent', all[MAIN]?.x ?? 0) : undefined)
    return p ? { ...all, [id]: { ...p, left: ticksLeft, sayLeft: ticksLeft, idle: 0, ...change } } : all
  })
}

// Text that floats around a Clawd: its name tag, then a speech bubble or its z's.
type Label = { row: number; col: number; text: string; kind: 'tag' | 'say' | 'zzz' }

// A staircase of z's drifting up from a sleeping Clawd's head; on his left near the right edge.
export function zzz(p: Pet, x: number, width: number): Label[] {
  const right = x + 12 <= width
  const stairs = ([[2, 'z'], [1, 'z'], [0, 'Z']] as const).map(([row, text], i) => ({
    row,
    col: right ? x + 9 + i : Math.max(0, x - 2 - i),
    text,
    kind: 'zzz' as const,
  }))
  // each z appears in turn, then they fade from the bottom
  const [from, to] = ([[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3]] as const)[ph(p.frame * TICK_MS, 750, 6)]!
  return stairs.slice(from, to)
}
export function labels(p: Pet, x: number, width: number): Label[] {
  const t = p.frame * TICK_MS
  const fit = (col: number, text: string) => Math.max(0, Math.min(col, width - text.length))
  const out: Label[] = [{ row: 0, col: fit(x + 4 - Math.floor(p.name.length / 2), p.name), text: p.name, kind: 'tag' }]
  if (p.act === 'sleep') return [...out, ...zzz(p, x, width)]
  const pondering = p.style === 1 ? (ph(t, 1500, 2) ? '?' : '') : ['.', '..', '...'][ph(t, 750, 3)]!
  const say = p.act === 'think' && !p.say ? pondering : p.say
  if (say) out.push({ row: 1, col: fit(x + 8, say), text: say, kind: 'say' })
  return out
}

type Cell = { ch: string; kind: 'body' | 'tag' | 'say' | 'zzz' | 'none'; color?: string }

const esc = (s: string) => s.replace(/[&<>]/g, c => `&#${c.charCodeAt(0)};`)

// One SVG rect per run of same-coloured pixels in a row: band text row r and
// column c put pixels at x = c * 2, y = r * 4, each 1 wide and 2 tall.
const rects = (row: number, col: number, px: string[], color: string) =>
  px
    .flatMap((line, y) => {
      const out: string[] = []
      for (let i = 0; i < line.length; ) {
        const ink = line[i]!
        let j = i
        while (line[j] === ink) j++
        if (ink !== '.') out.push(`<rect x="${col * 2 + i}" y="${row * 4 + y * 2}" width="${j - i}" height="2" fill="${ink === 'X' ? color : INK[ink]}"/>`)
        i = j
      }
      return out
    })
    .join('')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A reload keeps every live Clawd (state outlives it); older shapes get today's fields.
    await update($, clawds, all => ({
      [MAIN]: MAIN_START,
      ...Object.fromEntries(Object.entries(all).map(([id, p]) => [id, { ...START, ...p }])),
    }))
    loop($)
    isCloud = (await $.env.get('CLAUDE_CODE_REMOTE')) === 'true'
    const now = await $.session.usage()
    await update($, usage, () => usageOf(now, isCloud))
    return next(e)
  })

  // The meter follows the engine's own measurements.
  on('session.measure', async ($, e, next) => {
    await update($, usage, () => usageOf(e, isCloud))
    return next(e)
  })

  // Typing wakes Clawd and keeps him up; writes at most about once a second.
  on('prompt.edit', async ($, e, next) => {
    const p = (await read($, clawds))[MAIN]
    if (p?.act === 'sleep') await feel($, MAIN, ticks(2000), { act: 'look', say: '!' })
    else if (p && p.idle > ticks(1000)) await feel($, MAIN, p.left, { sayLeft: p.sayLeft })
    return next(e)
  }).catch(($, e, next) => next(e)) // never let a Clawd get in your typing's way

  // A main-loop turn starting (typed, queued, or a continuation): Clawd stops to think.
  on('turn.start', async ($, e, next) => {
    await feel($, MAIN, 1, { act: 'think', say: '', busy: true })
    return next(e)
  })

  // Each tool call shows as what it does (reading, hammering, typing...) for as long as it runs.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const tool = String(e.tool).replace(/^mcp__.+?__/, '')
    await feel($, id, ticks(1500), { act: doing(tool), say: tool, inTool: true }, true)
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true) await feel($, id, ticks(5000), { act: 'sad', say: 'ouch', inTool: false })
    else await update($, clawds, all => (all[id] ? { ...all, [id]: { ...all[id]!, inTool: false, idle: 0 } } : all))
    return ran
  }).catch(($, e, next) => next(e)) // never let a Clawd get in a tool's way

  // Each agent the model or a workflow starts gets a Clawd that hops out of its parent's.
  // A teammate in a terminal pane of its own runs no loop here (its id is its address).
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId
    if (id && id !== started.teammateId) {
      await update($, clawds, all => ({
        ...all,
        [id]: { ...newcomer(all, e.name ?? e.description, all[e.parentAgentId ?? MAIN]?.x ?? 0), teammate: started.teammateId !== undefined },
      }))
    }
    return started
  }).catch(($, e, next) => next(e)) // never let a Clawd get in a spawn's way

  // A finished turn: a jump for an answer, a slump for a stop or an error. A
  // subagent's Clawd then leaves; a teammate's stays until it is woken again.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const isTeammate = (await read($, clawds))[id]?.teammate === true
    const mood: Partial<Pet> = e.reason === 'answer' ? { act: 'jump', say: 'done!' } : { act: 'sad', say: e.isAborted ? 'stopped' : 'oops' }
    await feel($, id, ticks(3000), { ...mood, busy: false, inTool: false, bye: id !== MAIN && !isTeammate })
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    quiet = 0
    const width = Math.max(9, Math.min(e.props.bodyColumns, 80))
    widths[e.surface] = width
    const all = await read($, clawds)
    const drawn = shown(all, width)
    const hidden = Object.keys(all).length - drawn.size
    // subagents first so the main Clawd is drawn on top
    const crowd = Object.entries(all)
      .filter(([id]) => drawn.has(id))
      .sort(([a], [b]) => Number(a === MAIN) - Number(b === MAIN))
      .map(([id, p]) => ({ id, p, x: Math.min(p.x, width - 9), px: pose(p) }))

    // Band row 0 holds name tags, rows 1-4 the world. Bodies go down first; then
    // the "+N" of Clawds not drawn, then labels, main's first. A tag slides at
    // most half the room each Clawd has, so it stays over its own body; any
    // other label is left out where it would touch something already drawn.
    const grid: Cell[][] = Array.from({ length: 5 }, () => Array.from({ length: width }, (): Cell => ({ ch: ' ', kind: 'none' })))
    for (const c of crowd) {
      cellsOf(c.px).forEach((line, y) =>
        line.forEach((cell, i) => {
          if (cell.ch !== ' ') grid[y + 1]![c.x + i] = { ch: cell.ch, kind: 'body', color: cell.ink === 'X' ? c.p.color : INK[cell.ink] }
        }),
      )
    }
    const placed: (Label & { color: string })[] = []
    // Top right, dim: the "+N" of Clawds not drawn, then the usage meter left of it.
    let right = width
    for (const text of [hidden > 0 ? `+${hidden}` : '', meter(await read($, usage))]) {
      const col = right - text.length - (right < width ? 1 : 0)
      if (!text || col < 0) continue
      ;[...text].forEach((ch, i) => (grid[0]![col + i] = { ch, kind: 'tag', color: '#8a8a8a' }))
      placed.push({ row: 0, col, text, kind: 'tag', color: '#8a8a8a' })
      right = col
    }
    const reach = Math.min(10, Math.max(1, Math.floor(width / crowd.length / 2)))
    for (const c of [...crowd].reverse()) {
      for (const l of labels(c.p, c.x, width)) {
        const line = grid[l.row]!
        const free = (col: number) =>
          col >= 0 && col + l.text.length <= width && line.slice(Math.max(0, col - 1), col + l.text.length + 1).every(cell => cell.kind === 'none')
        const shifts = l.kind === 'tag' ? [0, ...Array.from({ length: reach }, (_, d) => [d + 1, -(d + 1)]).flat()] : [0]
        const col = shifts.map(d => l.col + d).find(free)
        if (col === undefined) continue
        ;[...l.text].forEach((ch, i) => (line[col + i] = { ch, kind: l.kind, color: c.p.color }))
        placed.push({ ...l, col, color: c.p.color })
      }
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const runs = (row: Cell[]) =>
        row.reduce<(Cell & { text: string })[]>((acc, c) => {
          const last = acc[acc.length - 1]
          if (last?.kind === c.kind && last.color === c.color) last.text += c.ch
          else acc.push({ ...c, text: c.ch })
          return acc
        }, [])
      return (
        <Box flexDirection="column">
          {grid.map(row => (
            <Box flexDirection="row" height={1}>
              {runs(row).map(r =>
                r.kind === 'none' ? (
                  <Box width={r.text.length} />
                ) : (
                  <Text color={r.color} italic={r.kind === 'say'} dimColor={r.kind === 'tag' || r.kind === 'zzz'}>
                    {r.text}
                  </Text>
                ),
              )}
            </Box>
          ))}
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)
    const bodies = crowd.map(c => rects(1, c.x, c.px, c.p.color))
    const texts = placed.map(
      l =>
        `<text x="${l.col * 2}" y="${l.row * 4 + 3.2}" font-size="3" fill="${l.color}" font-family="SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace"${l.kind === 'say' ? ' font-style="italic"' : ' opacity="0.7"'}>${esc(l.text)}</text>`,
    )
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * 2} 20" width="${width * 8}" height="80" shape-rendering="crispEdges">${bodies.join('')}${texts.join('')}</svg>`
    const alt = crowd.map(c => `${c.p.name} is ${c.p.act === 'walk' ? 'wandering' : c.p.act === 'sleep' ? 'asleep' : c.p.act}`).join(', ')
    return <Svg source={source} alt={hidden > 0 ? `${alt}, and ${hidden} more` : alt} />
  })
}
