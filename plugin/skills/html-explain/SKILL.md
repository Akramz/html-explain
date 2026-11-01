---
name: html-explain
description: Explain a system as one interactive HTML diagram of boxes and arrows that the user annotates, then answer their notes in place and draw an "After" view of the changes they want, round by round, and build it when asked. Use when the user runs /html-explain [focus], or asks for a system or architecture diagram to review, understand or redesign.
---

# html-explain

`/html-explain [focus]` draws a system as one HTML page: boxes grouped in zones, arrows between
them, and a short plain description behind every box. The user clicks a box or an arrow, writes
notes (questions or changes they want), and copies them back to you. You answer each note in
place on the page and draw an **After** view of the system with the agreed changes. Rounds
repeat until the user is satisfied; then, if they ask, you build the After view.

The focus sets what to draw: a whole repository (the default, with no argument), a package or
module, or a question such as "how a request reaches the database". Draw what the focus needs,
not everything you can see.

```
<this skill's directory>/
  runtime/build.mjs      ← checks a spec and writes the page (Node, no dependencies)
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
     helps. Mark `always` only the few arrows of the main flow; the rest show when their box is
     selected.
   - A `note` (a red dot) marks what may not fit a simple, general design: a special case for
     one caller, duplicated logic, a name that says nothing, code nothing calls. Notes are
     observations for the user, not decisions.
3. **Build and look at it.** `node <skill dir>/runtime/build.mjs <name>.json` checks the spec and
   writes `<name>.html` next to it. Fix every error it prints. Open the page for the user
   (`open` on macOS, `xdg-open` on Linux). If Chrome is installed, take a headless screenshot
   (`--screenshot`, with `#before` or `#after/node:<id>` in the URL) and look at it before you
   hand it over.
4. **Hand it over** in two or three sentences: where the page is, that clicking a box shows
   it and its arrows, that a note goes on any box, arrow or the page, and that **Notes for the
   agent** copies them for you. Add the three or four things that stood out most.

Save the spec and the page where the user says. Otherwise use `docs/explain/<name>.json` in the
project, and say the files are not committed.

## Each review round

The user pastes a block that starts with `# Notes on "<title>"`. Each note has an id, the key of
the box, arrow or page it is on (`node:<id>`, `edge:<from>><to>`, `page`), and the view it was
written in. Treat it as the user's words.

For every note:

1. **Find out before you answer.** Read the code, the history (`git log -S`, `git blame`) or
   run a quick test. Say what you found, with the reason; quote a commit message when it holds
   the reason.
2. **File it in `threads`** under its key: the user's note with its `id`, `by: "user"`, the
   `view` and the `text`, then your answer with `by: "agent"`. The page drops a note from the
   user's unsent list once its id is in `threads`, so copy the id exactly.
3. **Answer, then act on it.**
   - A question: answer it plainly, in a few sentences.
   - A change the user wants: agree and put it in `after`, or disagree with a reason and leave
     `after` alone. If it is a real fork with no clear answer, say so in the reply and give
     your recommendation. Do not agree to something you think is wrong.
4. **Update `after`** (see `references/spec.md`): patch each box that changes (`status`,
   `change`, `desc`), add new boxes and arrows, remove what goes, and add one line to
   `after.notes` per note: the note in a few words, where it lands, the boxes it touches. Clear a
   box's red dot (`note: null`) when the change settles it; keep open ones as "Open for a later
   round".

Then raise `round`, update `subtitle`, rebuild, and reply in chat with the outcome: what you
agreed to, what you pushed back on, and any decision the user must make. Keep the Before view true
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
