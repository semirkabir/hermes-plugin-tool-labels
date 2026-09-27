// tool-labels v1.2 — rewrites the collapsed tool-group summary line so it says
// what the calls actually were, in one vocabulary mixed from several harnesses.
//
// Source of truth is the run's real tool calls (tool name + arguments), read
// from React state behind the group — so collapsed runs whose rows were never
// mounted (chats opened from history) are relabeled too. Mounted rows' props,
// then row title text, are fallbacks. No app files are touched.
import { createElement as h } from 'react'

// ── Categories ───────────────────────────────────────────────────────────────

// Fixed clause order so the same run always reads the same way.
export const ORDER = [
  'edit', 'read', 'grep', 'list', 'websearch', 'webread', 'open', 'browser',
  'vision', 'run', 'code', 'recall', 'save', 'todo', 'ask', 'delegate', 'mcp', 'other',
]

const NAMED = {
  read_file: 'read', search_files: 'grep', list_files: 'list',
  write_file: 'edit', edit_file: 'edit', patch: 'edit',
  web_search: 'websearch', web_extract: 'webread',
  browser_navigate: 'open',
  vision_analyze: 'vision',
  terminal: 'run', execute_code: 'code',
  memory: 'save', session_search: 'recall', session_search_recall: 'recall',
  todo: 'todo', todo_list: 'todo',
  clarify: 'ask', delegate_task: 'delegate',
}

// Skill activity keeps the app's own wording ("Loaded skill: X").
const SKILL_TOOLS = new Set(['skill_view', 'skills_list', 'skill_manage'])

const PRETTY_SERVER = {
  github: 'GitHub', context7: 'Context7', tinyfish: 'TinyFish', firecrawl: 'Firecrawl',
  notion: 'Notion', slack: 'Slack', linear: 'Linear', playwright: 'Playwright',
  filesystem: 'Filesystem', hermes: 'Hermes',
}

export function prettyServer(raw) {
  const key = String(raw || '').toLowerCase()
  if (PRETTY_SERVER[key]) return PRETTY_SERVER[key]
  return key.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || raw
}

/** Category key for a tool name; MCP tools become `mcp:<server>`. */
export function categorize(toolName) {
  const name = String(toolName || '')
  if (SKILL_TOOLS.has(name)) return 'skill'
  if (NAMED[name]) return NAMED[name]
  const mcp = name.match(/^mcp__(.+?)__(.+)$/)
  if (mcp) {
    // Memory tools read as memory, not as "called Mnemosyne 4 times" —
    // whether the server or the tool carries the memory name.
    if (/mnemosyne|memory/i.test(name)) return /recall|search|get|list|stats/i.test(mcp[2]) ? 'recall' : 'save'
    return `mcp:${mcp[1]}`
  }
  if (/^mnemosyne_/.test(name)) return /recall|search|get|stats/.test(name) ? 'recall' : 'save'
  if (name.startsWith('browser_')) return 'browser'
  return 'other'
}

function asObject(v) {
  if (v && typeof v === 'object') return v
  if (typeof v === 'string') { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {} } catch { return {} } }
  return {}
}

/** How many things one call acted on — web_extract batches URLs, delegate batches tasks. */
export function units(call) {
  const args = asObject(call.args)
  if (call.toolName === 'web_extract' && Array.isArray(args.urls) && args.urls.length) return args.urls.length
  if (call.toolName === 'delegate_task' && Array.isArray(args.tasks) && args.tasks.length) return args.tasks.length
  return 1
}

/** { category → {n, names:Set} } for a list of calls {toolName,args}. Skills excluded. */
export function tally(calls) {
  const out = {}
  for (const call of calls) {
    const cat = categorize(call.toolName)
    if (cat === 'skill') continue
    const slot = out[cat] || (out[cat] = { n: 0, names: {} })
    slot.n += units(call)
    slot.names[call.toolName] = (slot.names[call.toolName] || 0) + units(call)
  }
  return out
}

function orderedKeys(t) {
  const keys = Object.keys(t)
  const rank = (k) => ORDER.indexOf(k.startsWith('mcp:') ? 'mcp' : k)
  return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// ── One vocabulary, best wording per tool type ──────────────────────────────
// Each row is borrowed from whichever harness names that kind of work best:
//   Claude Code  — read / grep ("searched for N patterns") / fetch / agents / todos
//   Codex        — commands, directory listings, "explored" as the umbrella verb
//   Claude.ai    — "searched the web"
//   OpenCode     — MCP calls named by server
// Long runs keep the first clauses in prose and fold the rest into Terse form,
// and the exact tool names (raw) sit in the hover tooltip.

const plural = (n, one, many) => (n === 1 ? one : many)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const low = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

// kind: 'count' → "<verb> N <noun>", 'times' → "<verb> [twice]", 'bare' → "<verb>"
// [past, present, one, many, terse-one, terse-many]
const WORDS = {
  edit: ['Edited', 'Editing', 'file', 'files', 'edit', 'edits'],
  read: ['Read', 'Reading', 'file', 'files', 'read', 'reads'],
  grep: ['Searched for', 'Searching for', 'pattern', 'patterns', 'grep', 'greps'],
  list: ['Listed', 'Listing', 'directory', 'directories', 'ls', 'ls'],
  websearch: ['Searched the web', 'Searching the web', null, null, 'search', 'searches'],
  webread: ['Fetched', 'Fetching', 'page', 'pages', 'fetch', 'fetches'],
  open: ['Opened', 'Opening', 'page', 'pages', 'page', 'pages'],
  browser: ['Took', 'Taking', 'browser action', 'browser actions', 'click', 'clicks'],
  vision: ['Viewed', 'Viewing', 'image', 'images', 'image', 'images'],
  run: ['Ran', 'Running', 'command', 'commands', 'cmd', 'cmds'],
  code: ['Ran', 'Running', 'script', 'scripts', 'script', 'scripts'],
  recall: ['Checked memory', 'Checking memory', null, null, 'recall', 'recalls'],
  save: ['Saved', 'Saving', 'memory', 'memories', 'save', 'saves'],
  todo: ['Updated todos', 'Updating todos', null, null, 'todo', 'todos'],
  ask: ['Asked', 'Asking', 'question', 'questions', 'ask', 'asks'],
  delegate: ['Launched', 'Launching', 'agent', 'agents', 'agent', 'agents'],
  other: ['Used', 'Using', 'tool', 'tools', 'tool', 'tools'],
}

// Prose clauses shown before the tail folds into terse form.
export const PROSE_LIMIT = 4

function proseClause(key, slot, live) {
  if (key.startsWith('mcp:')) return `${live ? 'Calling' : 'Called'} ${prettyServer(key.slice(4))} ${times(slot.n)}`
  const [past, present, one, many] = WORDS[key] || WORDS.other
  const verb = live ? present : past
  if (!one) return slot.n === 1 ? verb : `${verb} ${times(slot.n)}`
  return `${verb} ${slot.n} ${plural(slot.n, one, many)}`
}

function terseClause(key, slot) {
  if (key.startsWith('mcp:')) return `${prettyServer(key.slice(4)).toLowerCase()}×${slot.n}`
  const w = WORDS[key] || WORDS.other
  return `${slot.n} ${plural(slot.n, w[4], w[5])}`
}

export function composeBody(t, liveKey) {
  const keys = orderedKeys(t)
  // The live clause always stays in prose so the shimmer names what's happening.
  const prose = keys.slice(0, PROSE_LIMIT)
  if (liveKey && keys.includes(liveKey) && !prose.includes(liveKey)) { prose.pop(); prose.push(liveKey) }
  const rest = keys.filter((k) => !prose.includes(k))
  const head = prose.map((k, i) => { const c = proseClause(k, t[k], k === liveKey); return i === 0 ? c : low(c) }).join(', ')
  return rest.length ? `${head} · +${rest.map((k) => terseClause(k, t[k])).join(' · ')}` : head
}

/** Exact tool names and counts — shown on hover. */
export function rawNames(t) {
  const names = {}
  for (const k of orderedKeys(t)) for (const [n, c] of Object.entries(t[k].names)) names[n] = (names[n] || 0) + c
  return Object.entries(names).map(([n, c]) => `${n} ×${c}`).join(', ')
}

// ── App summary parsing (safety) ─────────────────────────────────────────────

const APP_VERBS = /^(Edited|Editing|Explored|Exploring|Searched|Searching|Read|Reading|Opened|Opening|Browsed|Browsing|Performed|Performing|Analyzed|Analyzing|Ran|Running|Delegated|Delegating|Used|Using|Fetched|Listed)\b/i
const SKILL_SEG = /^(loaded|loading|failed to load|reading|read|failed to read|listing|listed|failed to list) skill|^skill result/i
const FAIL_SEG = /^\d+ tool calls? failed$/i

/**
 * Split the app's summary into what we keep verbatim (skill activity, failure
 * count) and whether the rest is the app's own tool wording. Returns null when
 * any segment is unrecognised — then the line is left alone.
 */
export function parseAppSummary(text) {
  const segs = String(text || '').trim().split(/,\s+/).filter(Boolean)
  if (!segs.length) return null
  const keepHead = []
  const keepTail = []
  let toolSegs = 0
  for (const seg of segs) {
    if (SKILL_SEG.test(seg)) keepHead.push(seg)
    else if (FAIL_SEG.test(seg)) keepTail.push(seg)
    else if (APP_VERBS.test(seg)) toolSegs++
    else return null
  }
  return { keepHead, keepTail, toolSegs }
}

export function composeLabel(t, liveKey, appText) {
  const parsed = parseAppSummary(appText)
  if (!parsed) return null
  const body = Object.keys(t).length ? composeBody(t, liveKey) : ''
  if (!body && !parsed.keepHead.length) return null
  const all = [...parsed.keepHead, body, ...parsed.keepTail].filter(Boolean)
  return all.map((s, i) => (i === 0 ? cap(s) : low(s))).join(', ')
}

// ── DOM plumbing ─────────────────────────────────────────────────────────────

/** The tool call behind a row, read from its React props. */
export function callFromRow(row) {
  const key = Object.keys(row).find((k) => k.startsWith('__reactFiber$'))
  let fiber = key ? row[key] : null
  for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
    const part = fiber.memoizedProps && fiber.memoizedProps.part
    if (part && typeof part.toolName === 'string') {
      return { toolName: part.toolName, args: part.args, pending: part.result === undefined && part.completedAt === undefined }
    }
  }
  return null
}

const fiberOf = (el) => {
  const key = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  return key ? el[key] : null
}
const isToolPart = (p) => p && p.type === 'tool-call' && typeof p.toolName === 'string'
const toCall = (p) => ({ toolName: p.toolName, args: p.args, pending: p.result === undefined && p.completedAt === undefined })

// Every hook value of a function component fiber (refs unwrapped to .current).
function hookValues(fiber) {
  const out = []
  if (typeof fiber.type !== 'function' && !(fiber.type && typeof fiber.type === 'object')) return out
  for (let h = fiber.memoizedState, i = 0; h && typeof h === 'object' && 'next' in h && i < 80; h = h.next, i++) {
    const v = h.memoizedState
    out.push(v && typeof v === 'object' && 'current' in v && Object.keys(v).length === 1 ? v.current : v)
  }
  return out
}

/**
 * The run's tool calls straight from React state, for a group whose rows are
 * not mounted (a settled run stays collapsed, e.g. every chat opened from
 * history). Matched on data shapes only, never component names, so it survives
 * the minified production bundle:
 *   1. the nearest ancestor whose props are {startIndex:number, endIndex:number}
 *      is the run. That range is already split into runs vs cards (edits,
 *      connection cards) by the app, so it holds exactly the summarized calls.
 *   2. preferred: that run's own summary cache — a ref shaped
 *      {signature:string, tools:[tool-call parts], value:{summary:string}}.
 *   3. else: the first ancestor hook holding a runtime with getState() →
 *      {role, parts|content: [...]} (the message), sliced to the range.
 * Returns null when nothing matches; the caller then leaves the line alone.
 */
export function callsFromGroup(group) {
  let fiber = fiberOf(group)
  let run = null
  for (let i = 0; fiber && i < 12; i++, fiber = fiber.return) {
    const p = fiber.memoizedProps
    if (p && typeof p === 'object' && typeof p.startIndex === 'number' && typeof p.endIndex === 'number') { run = fiber; break }
  }
  if (!run) return null
  const { startIndex, endIndex } = run.memoizedProps

  for (const v of hookValues(run)) {
    if (v && typeof v === 'object' && typeof v.signature === 'string' && Array.isArray(v.tools)
      && v.value && typeof v.value.summary === 'string' && v.tools.every(isToolPart)) {
      return v.tools.map(toCall)
    }
  }

  for (let f = run.return, i = 0; f && i < 40; i++, f = f.return) {
    for (const v of hookValues(f)) {
      if (!v || typeof v !== 'object' || typeof v.getState !== 'function') continue
      let s
      try { s = v.getState() } catch { continue }
      const parts = s && (Array.isArray(s.parts) ? s.parts : s.content)
      if (!s || typeof s.role !== 'string' || !Array.isArray(parts)) continue
      const calls = parts.slice(Math.max(0, startIndex), endIndex + 1).filter(isToolPart)
      return calls.length ? calls.map(toCall) : null
    }
  }
  return null
}

// Fallback when props aren't reachable: the app's English row titles.
const TITLE_FALLBACK = [
  [/^(Read|Reading) file|^(Read|Reading) [^\s]+\.[a-z0-9]{1,6}$/i, 'read_file'],
  [/^(Searched|Searching) files/i, 'search_files'],
  [/^(Listed|Listing) files/i, 'list_files'],
  [/^(Searched|Searching) (web|“)/i, 'web_search'],
  [/^(Read|Reading) (webpage|[a-z0-9-]+\.[a-z.]+$)/i, 'web_extract'],
  [/^(Opened|Opening|Failed to open)/i, 'browser_navigate'],
  [/^(Ran|Running) code|^Scripting/i, 'execute_code'],
  [/^(Ran|Running)/i, 'terminal'],
  [/^(Analyzed|Analyzing) image/i, 'vision_analyze'],
  [/^Mcp (\S+)/i, null],
]

export function callFromTitle(title) {
  const text = String(title || '').trim()
  for (const [re, name] of TITLE_FALLBACK) {
    const m = text.match(re)
    if (!m) continue
    if (name) return { toolName: name, args: {} }
    return { toolName: `mcp__${m[1].toLowerCase()}__x`, args: {} }
  }
  return null
}

function summaryTextNode(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let n
  while ((n = w.nextNode())) if ((n.textContent || '').trim()) return n
  return null
}

function Chip() {
  return h('span', {
    className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)',
    title: 'Tool group labels active — hover a summary line for exact tool names',
  }, 'labels')
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export default {
  id: 'tool-labels',
  name: 'Tool group labels',
  register(ctx) {
    // el → { tally, liveKey, appText, label }
    const state = new WeakMap()

    function fix(el) {
      const node = summaryTextNode(el)
      if (!node) return
      const text = node.textContent.trim()
      const prev = state.get(el)
      const appText = prev && text === prev.label ? prev.appText : text

      const group = el.closest('[data-tool-group]')
      const rows = group ? Array.from(group.querySelectorAll('[data-tool-row]')) : []
      let t = prev ? prev.tally : null
      let liveKey = null
      // Primary: the run's calls from React state — the same parts the app
      // summarizes, available whether or not the rows are mounted (a settled
      // run stays collapsed, e.g. every chat opened from history).
      let calls = null
      if (group) { try { calls = callsFromGroup(group) } catch { calls = null } }
      // Fallback: the mounted rows (their props, else their titles).
      if (!calls && rows.length) {
        const fromRows = rows.map((r) => callFromRow(r) || callFromTitle(r.textContent)).filter(Boolean)
        if (fromRows.length === rows.length) calls = fromRows
      }
      if (calls && calls.length) {
        t = tally(calls)
        const live = el.querySelector('.shimmer')
        const narrating = live ? (calls.find((c) => c.pending) || calls[calls.length - 1]) : null
        liveKey = narrating ? categorize(narrating.toolName) : null
      }
      if (!t) return

      const label = composeLabel(t, liveKey, appText)
      state.set(el, { tally: t, liveKey, appText, label: label || text })
      if (label && label !== text) node.textContent = label
      const raw = rawNames(t)
      if (raw && el.getAttribute('title') !== raw) el.setAttribute('title', raw)
    }

    function sweep() {
      try { document.querySelectorAll('[data-tool-summary]').forEach(fix) } catch { /* never throw into the observer */ }
    }

    // setTimeout, not rAF: rAF stalls in background windows and live rows would be missed.
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      ctx.setTimeout(() => { queued = false; sweep() }, 120)
    }
    const obs = new MutationObserver(schedule)
    obs.observe(document.body, { subtree: true, childList: true, characterData: true })
    sweep()

    ctx.register({ id: 'chip', area: 'statusBar.right', order: 132, render: () => h(Chip) })
    ctx.onDispose(() => obs.disconnect())
  },
}
