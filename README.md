# tool-labels

A Hermes desktop plugin that fixes the collapsed tool-group summary line.

The desktop app collapses runs of tool calls into one grey summary line, and
that line often lies: two web searches read as "Explored 2 files", MCP calls
all become "used N tools". This plugin rebuilds the line from the actual tool
calls (tool name + arguments), in the wording you pick.

| Before | After |
| --- | --- |
| `Explored 3 files, read 3 pages, ran 1 command, used 3 tools` | `Read 2 files, searched for 1 pattern, fetched 3 pages, ran 1 command · +1 recall · github×2` |

### One label, mixed from several harnesses

There's one vocabulary. Each kind of work uses whichever agent harness words it best:

- **Claude Code**: file reads, grep ("searched for N patterns"), fetches, launched agents, todos
- **Codex CLI**: commands and directory listings
- **Claude.ai**: "searched the web"
- **OpenCode**: MCP calls named by server ("called GitHub twice")
- **Terse**: long runs keep the first 4 clauses in prose and fold the rest into compact form (`+1 recall · github×2`)
- **Raw tool names**: hover the summary line to see the exact calls (`read_file ×2, mcp__github__list_prs ×1, …`)

What it gets right that the app doesn't:
- grep (`search_files`) is its own clause, not "explored a file"
- batched `web_extract` counts every URL, not every call
- MCP tools are named by server ("called GitHub twice")
- memory tools read as memory ("checked memory", "saved 2 memories")
- browser clicks/screenshots are browser actions, not pages

Skill activity ("Loaded skill: X") and the failed-calls count are kept verbatim,
and any summary it doesn't recognise is left untouched.

Wording is modelled on each CLI's style; no code from those tools is included.

## Install

One-click (Hermes desktop):

<a href="hermes://plugin/install?repo=semirkabir/hermes-plugin-tool-labels&enable=1"><strong>Install in Hermes</strong></a>

Or from a terminal:

```
hermes plugins install semirkabir/hermes-plugin-tool-labels
```

Or by hand — copy `desktop/plugin.js` to:

```
~/.hermes/desktop-plugins/tool-labels/plugin.js
```

Then **restart the app** (or ⌘K → *Reload desktop plugins*). The app does not
always discover newly added plugin folders on its own. A small `labels` chip in
the status bar confirms the plugin is loaded.

If you installed the package form, also flip the Desktop toggle on in
Capabilities → Plugins (package halves ship opt-in).

## How it works

No app files touched: a `MutationObserver` watches the transcript and, for each
`data-tool-summary` header, reads the run's real tool calls from the React state
behind its `data-tool-group` — the same message parts the app summarizes. That
works whether or not the rows are mounted, so collapsed runs in chats opened
from history are relabeled too. The lookup matches data shapes only (a
`{startIndex, endIndex}` props range, the run's `{signature, tools, value}`
summary cache, or the message runtime's `getState().parts`), never component
names, so it holds up against the minified production bundle. Mounted rows'
props, then row titles, are fallbacks. Since it never edits the app bundle, it
survives app updates.

`tests/thread-e2e.test.tsx` (see its header for setup) mounts the app's real `Thread` component with a
mixed tool run and checks the label against it — including runs that stay
collapsed and are never expanded, and runs split around a file edit (runs from
a hermes-agent checkout's `apps/desktop`).

## Known limits

- It reads the app's internal React state. That relies on React's fiber
  internals and on the shapes above, not on any public API: an app release that
  renames `startIndex`/`endIndex` or restructures the run could stop it finding
  the calls. It then falls back to mounted rows, and otherwise leaves the app's
  label untouched rather than guessing.
- Labels are English only.

## Upstream

The real fix is a category-table change inside the desktop app, tracked in
[hermes-agent#123085](https://github.com/NousResearch/hermes-agent/issues/123085).
This plugin is a workaround for released versions.

## License

MIT
