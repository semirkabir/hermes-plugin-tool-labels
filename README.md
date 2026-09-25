# tool-labels

A Hermes desktop plugin that fixes the collapsed tool-group summary line.

The desktop app buckets consecutive tool calls into groups and labels them from
a category table — but web searches land in the same bucket as file reads, so a
turn with two searches collapses to **"Explored 2 files"**. This plugin rewrites
that summary from the group's actual tool rows:

| Before | After |
| --- | --- |
| `Explored 2 files` (two web searches) | `Searched 2 queries` |
| `Explored 1 file` (a page fetch) | `Read 1 page` |
| `Explored 3 files` (browser work) | `Browsed 3 pages` |

Rows can mix (`Searched 2 queries, ran 1 command`), and the plugin only rewrites
summaries it can fully account for — a summary it can't fully parse (like
`Loaded skill: X, explored 2 files`) is left untouched.

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

Pure DOM, no app files touched: a `MutationObserver` watches the transcript,
derives a label from each group's tool rows (`data-tool-row` inside
`data-tool-group` under a `data-tool-summary` header), and caches it per group
so the label survives the group collapsing (which unmounts the rows). Since it
never edits the app bundle, it survives app updates.

## Known limits

- A completed, collapsed group whose rows were never seen (e.g. a very old chat
  scrolled past before the plugin loaded) keeps its original label.
- Labels are derived from the rows' English title text.

## Upstream

The real fix is a category-table change inside the desktop app, tracked in
[hermes-agent#123085](https://github.com/NousResearch/hermes-agent/issues/123085).
This plugin is a workaround for released versions.

## License

MIT
