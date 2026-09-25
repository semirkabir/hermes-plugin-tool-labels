// tool-labels: fixes multi-call tool group summaries so they describe what the
// calls actually were (e.g. "Searched 2 queries" instead of "Explored 2 files").
// Derives labels from the tool rows inside each group (visible while the turn is
// live or when the group is expanded) and caches them per summary element so the
// label survives the group collapsing (which unmounts the rows). Only rewrites
// summaries it can fully account for (pure count-shaped segments whose totals
// match the row count), so joined summaries like "Loaded skill: X, explored 2
// files" are never truncated. No app files touched; survives app updates.
import { jsx } from 'react/jsx-runtime'

export default {
  id: 'tool-labels',
  name: 'Tool group labels',
  register(ctx) {
    const VERBS = {
      Searched: 'searched', Read: 'read', Fetched: 'fetched', Ran: 'ran', Edited: 'edited',
      Used: 'used', Browsed: 'browsed', Analyzed: 'analyzed', Delegated: 'delegated',
      Loaded: 'loaded', Listed: 'listed', Explored: 'explored', Checked: 'checked',
      Wrote: 'wrote', Created: 'created', Removed: 'removed', Cloned: 'cloned',
    }
    const NOUN = {
      searched: ['query', 'queries'], read: ['page', 'pages'], fetched: ['page', 'pages'],
      ran: ['command', 'commands'], edited: ['file', 'files'], used: ['tool', 'tools'],
      browsed: ['page', 'pages'], analyzed: ['image', 'images'], delegated: ['task', 'tasks'],
      loaded: ['item', 'items'], listed: ['item', 'items'], explored: ['file', 'files'],
      checked: ['item', 'items'], wrote: ['file', 'files'], created: ['file', 'files'],
      removed: ['file', 'files'], cloned: ['repo', 'repos'], items: ['item', 'items'],
    }
    const PAST = {
      searched: 'Searched', read: 'Read', fetched: 'Fetched', ran: 'Ran', edited: 'Edited',
      used: 'Used', browsed: 'Browsed', analyzed: 'Analyzed', delegated: 'Delegated',
      loaded: 'Loaded', listed: 'Listed', explored: 'Explored', checked: 'Checked',
      wrote: 'Wrote', created: 'Created', removed: 'Removed', cloned: 'Cloned', items: 'Used',
    }
    const TITLE_RE = /^(Searched|Read|Fetched|Ran|Edited|Used|Browsed|Analyzed|Delegated|Loaded|Listed|Explored|Checked|Wrote|Created|Removed|Cloned)\b/
    const NODE_RE = /^(Searched|Searching|Read|Reading|Fetched|Ran|Running|Edited|Editing|Used|Using|Browsed|Browsing|Analyzed|Delegated|Delegating|Loaded|Listed|Explored|Exploring|Checked|Wrote|Created|Removed|Cloned|searched|read|fetched|ran|edited|used|browsed|analyzed|delegated|loaded|listed|explored|checked|wrote|created|removed|cloned)\b/
    // A summary segment is "count-shaped" only in the exact `<Verb> <N> <noun>` form
    // the app composes for grouped calls — anything else (skill activity strings,
    // single-call previews) is opaque and must be preserved verbatim.
    const SEG_RE = /^(Searched|Searching|Read|Reading|Fetched|Ran|Running|Edited|Editing|Used|Using|Browsed|Browsing|Analyzed|Delegated|Delegating|Loaded|Listed|Explored|Exploring|Checked|Wrote|Created|Removed|Cloned|searched|read|fetched|ran|edited|used|browsed|analyzed|delegated|loaded|listed|explored|checked|wrote|created|removed|cloned)\s+(\d+)\s+\S+$/

    let rewrites = 0
    const learned = new WeakMap()

    const isUrl = (s) => /^(https?:\/\/|www\.)/i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|\s|$|…)/i.test(s)

    function classify (text) {
      const m = text.trim().match(TITLE_RE)
      return m ? (VERBS[m[1]] || 'items') : 'items'
    }

    // True when EVERY segment of the summary is count-shaped; returns the sum of
    // counts, or -1 when any segment is opaque.
    function countShapeSum (text) {
      const segments = text.trim().split(/,\s+/)
      let sum = 0
      for (const seg of segments) {
        const m = seg.match(SEG_RE)
        if (!m) return -1
        sum += parseInt(m[2], 10)
      }
      return sum
    }

    function readNoun (rows) {
      let urls = 0, files = 0
      for (const row of rows) {
        const target = (row.trim().replace(/^Read\s+/, '').split(/\s/)[0] || '')
        if (isUrl(target)) urls++
        else files++
      }
      return urls && !files ? 'page' : files && !urls ? 'file' : 'item'
    }

    function compose (rows) {
      const order = []
      const counts = {}
      for (const row of rows) {
        const k = classify(row)
        if (!(k in counts)) { counts[k] = 0; order.push(k) }
        counts[k]++
      }
      const segments = order.map((k) => {
        const n = counts[k]
        let noun
        if (k === 'read') {
          const rn = readNoun(rows.filter((r) => classify(r) === 'read'))
          noun = n === 1 ? rn : rn + 's'
        } else {
          noun = NOUN[k][n === 1 ? 0 : 1]
        }
        return `${PAST[k]} ${n} ${noun}`
      })
      if (!segments.length) return ''
      return segments.map((s, i) => (i === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1))).join(', ')
    }

    function findSummaryTextNode (el) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n
      while ((n = w.nextNode())) {
        const t = (n.textContent || '').trim()
        if (t && NODE_RE.test(t)) return n
      }
      return null
    }

    function fixSummary (el) {
      const group = el.closest('[data-tool-group]')
      const rows = group
        ? Array.from(group.querySelectorAll('[data-tool-row]'))
            .map((r) => (r.textContent || '').trim()).filter(Boolean)
        : []
      let label = null
      if (rows.length) {
        label = compose(rows)
        if (label) learned.set(el, label)
      } else {
        label = learned.get(el) || null
      }
      if (!label) return
      const node = findSummaryTextNode(el)
      if (!node) return
      const current = node.textContent.trim()
      if (current === label) return
      // Safety: only replace text we can fully account for.
      const sum = countShapeSum(current)
      if (sum < 0) return
      if (rows.length && sum !== rows.length) return
      node.textContent = label
      rewrites++
    }

    function sweep () {
      try {
        document.querySelectorAll('[data-tool-summary]').forEach(fixSummary)
      } catch (e) {
        /* never throw into the observer */
      }
    }

    // setTimeout, NOT requestAnimationFrame: rAF stalls in background/occluded
    // windows and the live-phase row capture would be missed entirely.
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      ctx.setTimeout(() => { queued = false; sweep() }, 120)
    }
    const obs = new MutationObserver(schedule)
    obs.observe(document.body, { subtree: true, childList: true, characterData: true })
    sweep()

    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 132,
      render: () => jsx('span', {
        className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)',
        title: `tool group labels: ${rewrites} rewritten`,
        children: 'labels',
      }),
    })
    ctx.onDispose(() => obs.disconnect())
  }
}
