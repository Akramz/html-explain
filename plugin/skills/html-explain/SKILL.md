---
name: html-explain
description: Explain a system as one interactive HTML diagram of boxes and arrows that the user annotates live, then answer each note in place as it arrives and draw an "After" view of the changes they want, round by round, and build it when asked. Use when the user runs /html-explain [focus], or asks for a system or architecture diagram to review, understand or redesign.
---

# html-explain

`/html-explain [focus]` draws a system as one HTML page: boxes grouped in zones, arrows between
them, and a short plain description behind every box. The user clicks a box to see it and its
arrows, and writes notes (questions or changes they want). In live mode each note reaches you the moment it
is posted: you answer it in place on the page and draw an **After** view of the system with the
agreed changes; the page redraws itself in place as you save, without a page reload. This
repeats until the user is satisfied; then, if they ask, you build the After view.

The focus sets what to draw: a whole repository (the default, with no argument), a package or
module, or a question such as "how a request reaches the database". Draw what the focus needs,
not everything you can see.

```
<this skill's directory>/
  runtime/build.mjs      ← checks a spec and writes the page (Node, no dependencies)
  runtime/serve.mjs      ← live mode: serves the page, takes notes, prints them for your monitor
  runtime/explain.js     ← the page runtime; build.mjs inlines it with explain.css
  references/spec.md     ← every spec field. Read it before you write a spec.
  examples/html-explain.json  ← a full spec with an After view and a thread. Copy its shape.
```

## Round 0: draw the system

1. **Read the code the focus points at.** List the modules or components, their size, what
   calls or imports what, and the data that moves between them. Read the README and the recent
   git history for why things are the way they are. For a large repository, read in parallel
   with subagents and keep only the conclusions.
2. **Write the spec** (`<name>.json`, see `references/spec.md`).
   - Group boxes into 4 to 8 zones by role: entry points, the core, the parts around it,
     state, outputs. Put the focus in a `core` zone; if it is a pipeline, give that zone
     `columns` in the order the steps run.
   - Aim for 15 to 50 boxes. A box is a module, a component or a concept the user would name.
     Its `title` is plain words; its `file` is where it lives.
   - Write every `desc` for someone new to the code: one to three short sentences on what it
     does for the system, in plain English, no jargon a newcomer would not know.
   - Arrows are real relations: calls, imports, data that flows. Label only the ones a label
     helps. Mark `always` only the main flow, 6 arrows at most (the build refuses more); the
     rest show when their box is selected. Columns with `arrows` already show a pipeline's order.
   - A `note` (a red dot) marks what may not fit a simple, general design: a special case for
     one caller, duplicated logic, a name that says nothing, code nothing calls. Notes are
     observations for the user, not decisions.
3. **Build and look at it.** Save the spec where the user says, else in `docs/explain/<name>.json`
   (create the folder). `node <skill dir>/runtime/build.mjs <name>.json` checks the spec and
   writes `<name>.html` next to it. Fix every error it prints. Open the page for the user
   (`open` on macOS, `xdg-open` on Linux). If Chrome is installed, take a headless screenshot
   (`--screenshot`, with `#before` or `#after/node:<id>` in the URL) and look at it before you
   hand it over.
4. **Go live** (next section) and open the server's URL for the user.
5. **Hand it over** in two or three sentences: where the files are (not committed), that clicking
   a box shows it and its arrows, and that a note goes on any box or the page and reaches
   you as soon as they add it. Add the three or four things that stood out most.

## Live mode

1. **Serve the page.** Start `node <skill dir>/runtime/serve.mjs <name>.json` as a background task
   (Bash `run_in_background`). Its first line is the URL; open that URL, not the HTML file. The
   server answers only the page it served.
2. **Watch for notes.** Arm a Monitor with the command
   `node <skill dir>/runtime/serve.mjs <name>.json --watch`, a description such as
   "html-explain notes on <name>", and the longest timeout. Each event line is one note:
   `note <id> on <key> (seen in <view>): <text>`. When the monitor expires, arm it again with the
   same command; it never repeats a note.
3. **Act on each note as it arrives,** without waiting for the user to ask. Handle it as in a
   review round (below): find out, decide whether the spec needs an edit at all (a question may
   need only an answer), file the note and your answer in `threads`, update `after`. Then run
   `node <skill dir>/runtime/build.mjs <name>.json`, which checks the spec and refreshes the HTML
   file; fix any error at once (the server skips a spec that fails the check). Several notes in
   one event are one batch.
4. **Your changes show at once.** Within a second of a valid save the page redraws in place and
   keeps the user's view, selection and whatever they are typing. Never ask them to reload the
   browser. In chat, say one line per batch; the answers live on the page.
5. **Stop** the monitor and the server (TaskStop) when the user says they are done. The server's
   working files (`<name>.inbox.jsonl`, `<name>.inbox.cursor`) can be deleted then.

If Node cannot serve (no free port, or the user opens the HTML file directly), the page works
offline: notes stay in the browser, and **Notes for the agent** copies them as one block for the
user to paste into the chat. Treat a pasted block like a batch of live notes.

## Each review round

Notes arrive as monitor events in live mode, or as a pasted block that starts with
`# Notes on "<title>"`. Each note has an id, the key of the box or page it is on (`node:<id>` or
`page`), and the view it was written in. Treat it as the user's
words.

For every note:

1. **Find out before you answer.** Read the code, the history (`git log -S`, `git blame`) or
   run a quick test. Say what you found, with the reason; quote a commit message when it holds
   the reason.
2. **File it in `threads`** under its key: the user's note with its `id`, `by: "user"`, the
   `view` and the `text`, then your answer with `by: "agent"`. The page drops a note from the
   user's unsent list once its id is in `threads`, so copy the id exactly.
3. **Answer, then act on it.**
   - A question: answer it plainly, in a few sentences.
   - A change the user wants: put it in `after`.
4. **Update `after`** (see `references/spec.md`): patch each box that changes (`status`,
   `change`, `desc`), add new boxes and arrows, remove what goes, and add one line to
   `after.notes` per note: the note in a few words, where it lands, the boxes it touches. Clear a
   box's red dot (`note: null`) when the change settles it; keep open ones as "Open for a later
   round". Follow each change through the system: check every box that calls, reads, depends
   on or documents the changed one, and patch it too, or say in `after.notes` why it stays the
   same. Name affected files that have no box.

Then rebuild, and reply in chat with the outcome: what you agreed to, what you pushed back on,
and any decision the user must make. Raise `round` and update `subtitle` when the user starts a
new round, not on every live note. Keep the Before view true
to the code as it is now; only After shows proposals.

## Building the After view

When the user asks you to implement the After view, treat it as a normal implementation task.
For a large change, offer an implementation plan first (`/html-plan` if it is installed).
Follow the project's own rules for tests and verification. As you build, put anything you learn
that changes the design back into the spec. When it is done, set `after.label` to "After
(built)", say where the code differs from the drawing, and rebuild the page.

To start a fresh review of the built system later, fold the After view into the base spec: apply
each patch to its box, drop removed boxes and arrows, move added ones into `nodes` and `edges`,
and clear `after`. Keep `threads`.

## Writing

- Plain, simple English, active voice. Short sentences.
- Name things the way the code and the user name them; explain a term before you lean on it.
- In threads, lead with the answer. Two to five sentences is usually enough.
