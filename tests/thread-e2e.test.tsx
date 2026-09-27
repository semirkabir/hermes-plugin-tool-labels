// Copy this file AND desktop/plugin.js (as tool-labels-plugin.js) into
// hermes-agent/apps/desktop/src/components/assistant-ui/tool/, then run it with vitest.

import { type ThreadMessage } from '@assistant-ui/react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubThreadEnvironment, stubThreadViewportSize, ThreadRuntime } from '../test-utils'
import { Thread } from '../thread'
// @ts-expect-error plain JS plugin
import plugin, { categorize, composeLabel, PROSE_LIMIT, tally } from './tool-labels-plugin.js'

stubThreadEnvironment()
stubThreadViewportSize()

const createdAt = new Date('2026-06-03T00:00:00.000Z')
let n = 0
const call = (toolName: string, args: Record<string, unknown>, result: unknown = { success: true }) => ({
  type: 'tool-call', toolCallId: `c${n++}`, toolName, args, argsText: JSON.stringify(args), result,
  timestamp: createdAt.getTime() / 1000 + n, completedAt: createdAt.getTime() / 1000 + n + 0.5
})
const msg = (content: unknown[]): ThreadMessage => ({
  id: `m${n++}`, role: 'assistant', content, status: { type: 'complete', reason: 'stop' }, createdAt,
  metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} }
}) as unknown as ThreadMessage

function mountPlugin() {
  const regs: any[] = []
  const disposers: any[] = []
  plugin.register({ register: (c: any) => regs.push(c), onDispose: (d: any) => disposers.push(d), setTimeout: (f: any, ms: number) => setTimeout(f, ms) })
  return { regs, dispose: () => disposers.forEach(d => d()) }
}

const summaryText = (el: HTMLElement) => el.querySelector('[data-tool-summary]')?.textContent ?? ''

afterEach(() => { cleanup(); localStorage.clear() })

describe('tool-labels plugin against the real Thread', () => {
  it('rewrites the collapsed summary from the real tool calls', async () => {
    const m = msg([
      call('read_file', { path: '/r/a.ts' }, { content: 'a' }),
      call('read_file', { path: '/r/b.ts' }, { content: 'b' }),
      call('search_files', { pattern: 'foo' }, { hits: [] }),
      call('web_extract', { urls: ['https://a.x', 'https://b.x', 'https://c.x'] }, { success: true, results: [] }),
      call('mcp__github__list_prs', { repo: 'x' }),
      call('mcp__github__get_pr', { n: 1 }),
      call('mcp__hermes__mnemosyne_recall', { query: 'x' }),
      call('terminal', { command: 'ls' }, { exit_code: 0 })
    ])
    const { container } = render(<ThreadRuntime messages={[msg([{ type: 'text', text: 'hi' }]) as any, m]}><Thread /></ThreadRuntime>)
    await waitFor(() => expect(container.querySelector('[data-tool-summary]')).not.toBeNull())
    const before = summaryText(container)
    // Rows must be visible once so the plugin can learn them; open the group.
    ;(container.querySelector('[data-tool-summary] button, [data-tool-summary] [role=button]') as HTMLElement)?.click()
    await waitFor(() => expect(container.querySelectorAll('[data-tool-row]').length).toBe(8))
    const p = mountPlugin()
    await waitFor(() => expect(summaryText(container)).toContain('Read 2 files'))
    const after = summaryText(container)
    console.log('BEFORE:', before)
    console.log('AFTER :', after)
    // 6 kinds of work: 4 in prose, the tail folds into terse form
    expect(after).toBe('Read 2 files, searched for 1 pattern, fetched 3 pages, ran 1 command · +1 recall · github×2')
    expect(PROSE_LIMIT).toBe(4)
    // collapse again: label must survive the rows unmounting
    ;(container.querySelector('[data-tool-summary] button, [data-tool-summary] [role=button]') as HTMLElement)?.click()
    await waitFor(() => expect(container.querySelectorAll('[data-tool-row]').length).toBe(0))
    await new Promise(r => setTimeout(r, 300))
    expect(summaryText(container)).toContain('Read 2 files')
    // exact tool names ride along as the hover tooltip
    expect(container.querySelector('[data-tool-summary]')?.getAttribute('title')).toContain('mcp__github__list_prs ×1')
    p.dispose()
  })

  it('relabels a settled run that stays collapsed (rows never mounted, like a chat opened from history)', async () => {
    const m = msg([
      call('read_file', { path: '/r/a.ts' }, { content: 'a' }),
      call('read_file', { path: '/r/b.ts' }, { content: 'b' }),
      call('search_files', { pattern: 'foo' }, { hits: [] }),
      call('web_extract', { urls: ['https://a.x', 'https://b.x', 'https://c.x'] }, { success: true, results: [] }),
      call('mcp__github__list_prs', { repo: 'x' }),
      call('mcp__github__get_pr', { n: 1 }),
      call('mcp__hermes__mnemosyne_recall', { query: 'x' }),
      call('terminal', { command: 'ls' }, { exit_code: 0 })
    ])
    const { container } = render(<ThreadRuntime messages={[msg([{ type: 'text', text: 'hi' }]) as any, m]}><Thread /></ThreadRuntime>)
    await waitFor(() => expect(container.querySelector('[data-tool-summary]')).not.toBeNull())
    const before = summaryText(container)
    expect(container.querySelectorAll('[data-tool-row]').length).toBe(0)
    const p = mountPlugin()
    await waitFor(() => expect(summaryText(container)).toContain('Read 2 files'))
    const after = summaryText(container)
    console.log('COLLAPSED BEFORE:', before)
    console.log('COLLAPSED AFTER :', after)
    expect(after).toBe('Read 2 files, searched for 1 pattern, fetched 3 pages, ran 1 command · +1 recall · github×2')
    // never expanded: the label came from React state, not from rows
    expect(container.querySelectorAll('[data-tool-row]').length).toBe(0)
    expect(container.querySelector('[data-tool-summary]')?.getAttribute('title')).toContain('mcp__github__list_prs ×1')
    p.dispose()
  })

  it('collapsed runs split around an edit count only their own calls', async () => {
    const m = msg([
      call('read_file', { path: '/r/a.ts' }, { content: 'a' }),
      call('read_file', { path: '/r/b.ts' }, { content: 'b' }),
      call('patch', { path: '/r/a.ts', old_string: 'x', new_string: 'y' }, { success: true, diff: '' }),
      call('search_files', { pattern: 'foo' }, { hits: [] }),
      call('terminal', { command: 'ls' }, { exit_code: 0 })
    ])
    const { container } = render(<ThreadRuntime messages={[msg([{ type: 'text', text: 'hi' }]) as any, m]}><Thread /></ThreadRuntime>)
    await waitFor(() => expect(container.querySelectorAll('[data-tool-summary]').length).toBe(2))
    const texts = () => Array.from(container.querySelectorAll('[data-tool-summary]')).map(s => s.textContent)
    const before = texts()
    expect(container.querySelectorAll('[data-tool-row]').length).toBe(0)
    const p = mountPlugin()
    await waitFor(() => expect(texts()).toEqual(['Read 2 files', 'Searched for 1 pattern, ran 1 command']))
    console.log('SPLIT BEFORE:', JSON.stringify(before))
    console.log('SPLIT AFTER :', JSON.stringify(texts()))
    const titles = Array.from(container.querySelectorAll('[data-tool-summary]')).map(s => s.getAttribute('title'))
    expect(titles).toEqual(['read_file ×2', 'search_files ×1, terminal ×1'])
    expect(container.querySelectorAll('[data-tool-row]').length).toBe(0)
    p.dispose()
  })

  it('leaves summaries it cannot account for alone', () => {
    expect(composeLabel(tally([{ toolName: 'read_file', args: {} }]), null, 'Something unexpected')).toBeNull()
  })

  it('keeps skill and failure clauses verbatim', () => {
    const t = tally([{ toolName: 'web_search', args: {} }, { toolName: 'web_search', args: {} }, { toolName: 'skill_view', args: {} }])
    expect(composeLabel(t, null, 'Loaded skill: foo, searched 2 queries, 1 tool call failed')).toBe(
      'Loaded skill: foo, searched the web twice, 1 tool call failed'
    )
  })

  it('routes names to categories', () => {
    expect(categorize('mcp__context7__query_docs')).toBe('mcp:context7')
    expect(categorize('browser_click')).toBe('browser')
    expect(categorize('browser_navigate')).toBe('open')
    expect(categorize('mnemosyne_remember')).toBe('save')
    expect(categorize('mcp__hermes__mnemosyne_recall')).toBe('recall')
    expect(categorize('mcp__my_server__do_thing')).toBe('mcp:my_server')
  })
})
