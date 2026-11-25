# html-explain

`/html-explain` draws a system as one interactive HTML page with levels you open one at a time.
The top level shows the main parts as boxes and arrows; a box with parts inside has a ▸ number
that opens it. Each box has a short plain description, its files, and the agent's findings.

- **Current and Proposed.** Flip to the Proposed view to see the system after the changes you
  agreed on: added boxes and arrows in green, changed ones in orange, removed ones in red. Each
  box counts the changes inside it, and the Design log lists every decision.
- **Mark reviewed.** Select a box and mark it reviewed: it leaves the outline and the diagram
  until you turn on **Show reviewed**, so what is left is what you still need to look at.
- **Notes on any box.** Write a question or a change you want on a box or on the page. Each note
  reaches your agent as you post it. The agent answers in the box's thread and updates the
  Proposed view; the page redraws in place, without losing what you are typing.

Use it to understand a codebase or one part of it, or to redesign it with your agent, round by
round, then have the agent build the Proposed view.

## Install

In Claude Code:

```console
/plugin install html-explain --marketplace Akramz/html-explain
```

The page is built by a small Node script, so you need [Node.js](https://nodejs.org) 18 or later.

## Use

```console
/html-explain                          # the whole repository
/html-explain the job runner           # one part of it
/html-explain how a request reaches the database
```

1. The agent reads the code, writes a spec and opens the page. Click a box to select it; click
   its ▸ number (or double-click it) to open it. Esc goes back up; C and P switch views.
2. Leave notes on any box. The page is served live from your machine: each note reaches the
   agent as soon as you add it.
3. The agent answers each note in its thread and draws the agreed changes in the Proposed view.
   Mark boxes reviewed as you finish with them.
4. When the Proposed view is what you want, ask the agent to build it.

The spec (`<name>.json`) is the source and the page (`<name>.html`) is one self-contained file
you can open, share or commit. Opened as a file, the page works offline: notes stay in your
browser until **Notes for the agent** copies them for you to paste into the chat. Live mode needs
an agent that can watch a background command (Claude Code's Monitor); elsewhere, paste the notes.

The live server listens on `127.0.0.1` only and answers only the page it served: that page
carries a random token, and calls without it, from another site or for another host are
refused. See [the spec reference](plugin/skills/html-explain/references/spec.md) and
[the example](plugin/skills/html-explain/examples/html-explain.json), which explains
html-explain itself, built as [docs/example.html](docs/example.html).

## Develop

```console
make check     # runtime syntax, the example spec, and the tests
make example   # rebuild docs/example.html
```

## License

MIT
