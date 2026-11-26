# The spec

One JSON file. `node runtime/build.mjs <name>.json` checks it and writes `<name>.html`;
`--check` only checks. `node runtime/serve.mjs <name>.json` serves it live: notes land in
`<name>.inbox.jsonl` (a click on **Improve proposal** lands there as a note with
`kind: "improve"`), and `--watch` prints each new one once (its place is kept in
`<name>.inbox.cursor`). `examples/html-explain.json` shows every field.

## Top level

```jsonc
{
  "id": "billing",                 // lowercase, digits, dashes; keys review marks and pending notes
  "title": "Billing",              // the header and the top of the outline
  "summary": "…",                  // one line under the title in Details
  "desc": "…",                     // optional: "What it does" for the whole system
  "does": ["…"],                   // optional: a list under it
  "files": ["billing/ 2,400"],     // optional
  "findings": [ … ],               // optional: observations about the whole system
  "kinds": {"module": "Billing code"},   // optional: names for the box kinds, in the project's words
  "root": { "nodes": [ … ], "edges": [ … ] },   // the top level
  "proposed": { … },               // optional: the system after the changes
  "threads": { … }                 // optional: the conversation on each box or the page
}
```

## Levels, boxes and arrows

A level is `{"nodes": [...], "edges": [...]}`. A box with `children` (another level) gets a ▸
number that opens it.

```jsonc
{
  "id": "store",                   // letters, digits, _ and -; unique in its level
  "label": "Order store",
  "kind": "store",                 // module | part | store | actor | external
  "x": 420, "y": 330,              // the box center on the level's grid
  "sub": "orders.py · one row per order",   // the small line on the box
  "desc": "Saves orders and …",    // optional: 1 to 3 plain sentences
  "files": ["orders.py 240"],      // optional
  "does": ["…"],                   // optional
  "findings": [
    {"t": "Two writers race on …", "type": "bug", "ref": "orders.py:88", "checked": true}
  ],                               // type: bug | simplify | dup
  "children": { "nodes": [ … ], "edges": [ … ] }   // optional
}
```

Boxes are 220 × 78 at x × 1.36, y × 1.5. Columns at x = 100, 420, 740, 1060 and rows at
y = 120, 330, 540 leave room for arrow labels. The check refuses boxes that overlap.

```jsonc
{"from": "parse", "to": "store", "label": "orders", "kind": "data", "bend": 28, "desc": "…"}
```

`from` uses or sends to `to`. `kind` is optional: `data` (dotted), `spawn` (purple), `http`
(teal). `bend` curves the arrow; two arrows between the same boxes curve apart on their own.
Arrows take no notes: a note about an arrow goes on one of its boxes.

`text` fields take `` `code` `` and `**bold**`.

## proposed

```jsonc
"proposed": {
  "summary": "Round 2: … Round 1: …",
  "ops": [
    {"op": "add",    "at": ["tools"], "node": {"id": "draw", "label": "draw", "kind": "module", "x": 420, "y": 540, "change": "New: … See log 2."}},
    {"op": "remove", "at": ["tools"], "id": "views"},
    {"op": "change", "at": [],        "id": "tools", "set": {"sub": "read · draw", "change": "Two tools. See log 2, 3."}},
    {"op": "edge",   "at": ["tools"], "edge": {"from": "read", "to": "draw", "label": "view"}},
    {"op": "unedge", "at": ["tools"], "from": "read", "to": "views"},
    {"op": "reedge", "at": [],        "from": "tools", "to": "store", "set": {"label": "draw → labels", "change": "…"}}
  ],
  "log": [
    {"date": "2026-11-25", "status": "decided", "title": "2 · One vector tool: draw", "text": "…"}
  ]
}
```

- `at` is the path of the level the op works in: `[]` is the top level, `["tools"]` the level
  inside the `tools` box, `["loop", "label"]` one deeper.
- The ops run in order on a copy of `root`. `change` and `reedge` merge `set` into the box or
  arrow. `remove` also drops the arrows of the box. An `add` or a `change` may move a box.
- The page compares the two trees by id: a box or arrow that is new is green, one whose label,
  `sub` or `change` differs is orange, one that is gone is red. The proposed tree must pass the
  same check as `root`.
- `log` entries show in the Design log tab, in order. `status` is `decided` (the user's call) or
  `proposed` (what you think it implies).

## threads

```jsonc
"threads": {
  "node:tools/read": [
    {"id": "n3f2ab", "by": "user", "view": "proposed", "text": "Why percent and not pixels?"},
    {"by": "agent", "text": "Percent works at every zoom …"}
  ],
  "page": [ … ]
}
```

Keys are `page` or `node:<path>`, the ids from the top level down. A box only in the proposed
tree can have a thread too. Copy each user note's `id`: the page then removes it from the
reader's pending notes.

## Links

`<page>.html#current`, `#proposed`, and `#proposed/tools/read` open a view at a level.
