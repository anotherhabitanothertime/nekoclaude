export type Act = 'walk' | 'run' | 'look' | 'sit' | 'sleep' | 'jump' | 'sad' | 'think' | 'read' | 'edit' | 'bash' | 'web' | 'spawn' | 'plan'
export type Pet = {
  x: number
  dir: number
  act: Act
  left: number
  frame: number
  say: string
  sayLeft: number
  idle: number
  busy: boolean
  color: string
  name: string
  style: number // how this Clawd thinks: 0 paces, 1 ponders, 2 taps a foot
  hat: number // index into the hats; -1 for none (the main Clawd)
  bye?: boolean
  inTool?: boolean // a tool call is running: a long one is no sign the agent died
  teammate?: boolean // a teammate goes idle between turns instead of leaving
}
// One Clawd per agent loop: 'main' for the main one, a subagent's by its agentId.
export type Clawds = Record<string, Pet>
// The context window's fill, the 5-hour limit's and the spend limit's use, as whole
// percents, and in a cloud session its spend in dollars; each absent until known.
export type Usage = { ctx?: number; session?: number; credits?: number; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    'clawd-pet': { clawds: Clawds; usage: Usage }
  }
}
