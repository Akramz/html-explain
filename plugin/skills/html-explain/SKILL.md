---
name: html-explain
description: Explain a system as one interactive HTML page of levels you open one at a time - boxes and arrows per level, a Current and a Proposed view with colored changes, Mark reviewed, and notes on any box that the agent answers in place - then build the Proposed view when asked. Use when the user runs /html-explain [focus], or asks for an interactive, hierarchical system or architecture diagram to review, understand or redesign.
---

# html-explain

`/html-explain [focus]` draws a system as one HTML page. The top level shows the main parts as
boxes and arrows. A box with parts inside has a ▸ number; a click on it opens the box as its own
level. A click on the box body selects it: the Details panel shows what it does, its files, its
findings, a **Mark reviewed** button and its notes. A reviewed box disappears from the outline
and the diagram until the user turns on **Show reviewed**.

The **Proposed** view is the system after the changes the user wants: added boxes and arrows are
green, changed ones orange, removed ones red on a shelf under their level. Each level counts the
changes inside each box. The **Design log** tab lists every decision.

The user writes notes on any box or on the page. In live mode each note reaches you the moment
it is posted; you answer it in the box's thread and update the Proposed view, and the page
redraws in place. The **Improve proposal** button at the top right asks you for one full pass
over the proposal with everything said so far.

The focus sets what to draw: a whole repository (the default, with no argument), a package, or
a question such as "how a request reaches the database".

```
<this skill's directory>/
  runtime/build.mjs      ← checks a spec and writes the page (Node, no dependencies)
  runtime/serve.mjs      ← live mode: serves the page, takes notes, prints them for your monitor
  runtime/explain.js     ← the page runtime; build.mjs inlines it with explain.css
  references/spec.md     ← every spec field. Read it before you write a spec.
  examples/html-explain.json  ← a full spec with three levels, a proposal and threads. Copy its shape.
```

## Round 0: draw the system

1. **Read the code the focus points at.** List the parts, their size, what calls or imports
   what, and the data that moves between them. Read the README and recent git history for why
   things are the way they are. For a large repository, read in parallel with subagents and
   keep only the conclusions.
2. **Write the spec** (`<name>.json`, see `references/spec.md`).
   - The top level has 6 to 12 boxes: the parts a newcomer would name, the people and agents
     around them, the files they share. Every part with real structure gets `children`: its
     own level of 3 to 10 boxes. Go 2 to 4 levels deep, down to modules or functions worth a
     look, not every function.
   - Pick each box's `kind`: `module` (code of the system), `part` (code the user writes or
     plugs in), `store` (files or tables on disk), `actor` (a person or agent), `external`
     (outside the system). Set `kinds` to name them in the project's words ("Billing code").
   - Place boxes on a grid: columns at x = 100, 420, 740, 1060 and rows at y = 120, 330, 540.
     Put the main flow left to right or top to bottom. Shift a box by half a step to keep an
     arrow from crossing another box. `build.mjs` refuses boxes that overlap.
   - `sub` is the one line on the box: what is in it or what it does, in a few words. `desc`
     is one to three plain sentences for someone new to the code. `files` lists files with
     their line counts ("run.py 387"). `does` lists what it does, when a list reads better.
   - Arrows are real relations: calls, data, process spawns, HTTP. Label each with what moves.
     `kind: "data"` draws dotted, `spawn` purple, `http` teal. Use `bend` when two arrows or
     an arrow and a box collide.
   - `findings` mark what may not fit a simple, general design: duplicated state, a special
     case for one caller, a name that says nothing, a bug. Give each a `type` (`bug`,
     `simplify`, `dup`), a `ref` (`file:line`), and `checked: true` once you have confirmed it
     in the code. Findings are observations, not decisions.
3. **Build and look at it.** Save the spec where the user says, else in
   `docs/explain/<name>.json`. `node <skill dir>/runtime/build.mjs <name>.json` checks the spec
   and writes `<name>.html` next to it. Fix every error it prints. If Chrome is installed, take
   headless screenshots (`--screenshot --virtual-time-budget=3000`, with `#current` and
   `#current/<id>` in the URL) of the top level and one or two inner levels, and fix crossed
   arrows and clipped labels before you hand it over.
4. **Go live** (next section) and open the server's URL for the user, without taking focus
   (`open -g` on macOS).
5. **Hand it over** in two or three sentences: where the files are (not committed), that a click
   selects a box and its ▸ number opens it, and that a note on any box reaches you as soon as
   they add it. Add the three or four findings that stood out most.

## Live mode

Live mode needs a tool that runs a command in the background and reports each line it prints
(Claude Code: Bash `run_in_background` and Monitor). Without one, skip this section: open the
HTML file, and the user pastes notes to you with **Notes for the agent**.

1. **Serve the page.** Start `node <skill dir>/runtime/serve.mjs <name>.json` in the background.
   Its first line is the URL; open that URL, not the HTML file. The server answers only the page
   it served.
2. **Watch for notes.** Arm a Monitor with `node <skill dir>/runtime/serve.mjs <name>.json --watch`,
   a description such as "html-explain notes on <name>", and the longest timeout. Each event
   line is one note: `note <id> on <key> (seen in <view>): <text>`. The key is `page` or
   `node:<path>`, the ids from the top level down (`node:tools/read`). A line that starts with
   `improve` instead of `note` is a click on **Improve proposal**: do an improve pass (below).
   When the monitor expires, arm it again with the same command; it never repeats a note.
3. **Act on each note as it arrives,** without waiting to be asked, as in a review round
   (below). Then run `build.mjs`; fix any error at once (the server skips a spec that fails the
   check). Several notes in one event are one batch.
4. **Your changes show at once.** Within a second or two of a valid save the page redraws in
   place and keeps the user's level, selection and draft. Never ask them to reload. In chat, say
   one line per batch; the answers live on the page.
5. **Stop** the monitor and the server when the user says they are done. Delete
   `<name>.inbox.jsonl` and `<name>.inbox.cursor` then.

A pasted block starts with `# Notes on "<title>"` and lists the same ids and keys. Treat it like
a batch of live notes. A note marked `(improve request, …)` asks for an improve pass.

## Each review round

For every note:

1. **Find out before you answer.** Read the code, the history (`git log -S`, `git blame`) or run
   a quick test. Say what you found and why; quote a commit message when it holds the reason.
2. **File it in `threads`** under its key: the user's note with its `id`, `by: "user"`, the
   `view` and the `text`, then your answer with `by: "agent"`. The page drops a note from the
   user's pending list once its id is in `threads`, so copy the id exactly.
3. **Answer, then act on it.** A question gets a short, plain answer (see Writing). A change the
   user wants goes into `proposed`, with no arguing it away; if you see a problem with it, say
   so in the thread and still draw it.
4. **Update `proposed`** (see `references/spec.md`).
   - Add one `log` entry per decision, numbered in its title ("7 · No trains_map"). Status
     `decided` is the user's call; `proposed` is what you think it implies, for them to confirm.
   - Write the change as `ops` at the right path: `add`, `remove`, `change`, `edge`, `unedge`,
     `reedge`. Give each changed or added box and arrow a `change` sentence that ends with
     "See log N".
   - Follow each change through the system: every box that calls, reads, depends on or
     documents the changed one, at every level. Patch it too, or say in the log entry why it
     stays the same. Name affected files that have no box.
   - Rewrite `proposed.summary` to say what the rounds so far changed, newest first.

Then rebuild, and reply in chat with the outcome: what you changed, what you disagree with, and
any decision the user must make. Keep `root` true to the code as it is now; only `proposed`
holds changes.

## Improve pass

An improve request asks you to bring the whole Proposed view up to date, not to answer one note.

1. **Gather everything.** Read the whole spec again: every thread, every log entry and every
   finding. Recall what the user said about this design in chat too, not only on the page.
2. **Put each agreed change in `ops`** and follow it through every level, as in a review round.
3. **Settle conflicts.** Where two rounds disagree, the newest word from the user wins. Drop ops
   that a later round undid, and merge ops that repeat each other.
4. **Fill the gaps:** a changed box with no `change` sentence, a box or `desc` that still tells
   the old story, an arrow that still points at a removed box, a log entry with no op.
5. **Log it.** Add one entry, "N · Improve pass", status `proposed`, that lists what you changed.
   Never undo a `decided` entry; if you think one is wrong, say so in your answer.
6. Rewrite `proposed.summary`.
7. **Answer on the page.** File the request in `threads.page` with its id, `by: "user"`, then
   your answer: a short list of what changed and any decision the user must make. The button
   stays on "Improving…" until that id is in `threads`.

Then rebuild. In chat, say one line.

## Building the Proposed view

When the user asks you to build it, treat it as a normal implementation task. For a large
change, offer an implementation plan first (`/html-plan` if it is installed). Follow the
project's own rules for tests and verification. As you build, put anything you learn that
changes the design back into the spec.

To review the built system later, fold the proposal into `root`: apply the ops, drop each
`change` field, clear `proposed`, and keep `threads`.

## Writing

- Plain, simple English, active voice. Short sentences.
- Name things the way the code and the user name them; explain a term before you lean on it.
- In threads, keep answers short and simple, in natural American English: lead with the answer,
  use everyday words, skip jargon and filler. One to three sentences is usually enough.
