# The spec

One JSON file. `node runtime/build.mjs <name>.json` checks it and writes `<name>.html`;
`--check` only checks. `examples/html-explain.json` uses every field.

## Top level

```jsonc
{
  "id": "billing",                 // lowercase, digits, dashes; keys the reader's unsent notes
  "title": "How billing works",
  "subtitle": "main @ 3f2a1c9 · round 2",   // optional; `code` spans allowed
  "summary": "…",                  // what the page shows, read before any click
  "round": 2,                      // raise it each review round
  "zones": [ … ],
  "nodes": [ … ],
  "edges": [ … ],
  "after": { … },                  // optional: the proposed system
  "threads": { … }                 // optional: the conversation on each box, arrow or the page
}
```

## Zones

The board is a 12-column grid; zones fill it in order.

```jsonc
{
  "id": "core",
  "title": "The request path",
  "why": "One line under the title.",          // optional
  "span": 8,                                   // columns of 12; default 12
  "style": "core",                             // optional: "core" (highlighted) or "outside" (dashed green)
  "after_only": true,                          // optional: shown only in the After view
  "before_only": true,                         // optional: shown only in the Before view
  "columns": [                                 // optional: steps side by side, in order
    {"title": "1 · Parse", "nodes": ["parse", "validate"]},
    {"title": "2 · Store", "nodes": ["store"]}
  ],
  "arrows": true,                              // optional: → between columns
  "flow": "↺ …"                               // optional: a line under the columns
}
```

A box sits in the column that lists it, else in its zone's free area. A box may be listed in one
column only.

## Nodes (boxes)

```jsonc
{
  "id": "store",                   // unique
  "title": "Order store",          // plain words
  "file": "billing/store.py",      // optional: where it lives
  "size": "240 lines",             // optional: shown on the box in the Before view
  "zone": "core",
  "kind": "part",                  // optional: "part" (filled) or "step" (outlined); else a plain module
  "tag": "you write it",           // optional: a small tag above the title in the panel
  "desc": "Saves orders and …",    // 1 to 3 plain sentences; `code` spans allowed
  "note": "Two writers race …"     // optional: a red dot, worth a look
}
```

## Edges (arrows)

```jsonc
{"from": "parse", "to": "store", "label": "orders", "desc": "…", "always": true}
```

`from` uses or sends to `to`. `label`, `desc` and `always` are optional. An arrow shows when one of
its boxes is selected; `always` shows it all the time (keep those few). Its key is `from>to`.

## after

```jsonc
"after": {
  "label": "After",                            // the switch's name; "After (built)" once built
  "summary": "What the After view changes.",
  "nodes": {                                   // patches to existing boxes
    "store": {"status": "changed", "desc": "…", "change": "What changes, in a sentence.", "note": null},
    "cache": {"status": "removed", "desc": "Removed: … replaces it."}
  },
  "add": [ {"id": "queue", "title": "Queue", "zone": "core", "desc": "…"} ],   // new boxes
  "edges": {
    "add": [ {"from": "parse", "to": "queue"} ],
    "remove": ["parse>store"]
  },
  "notes": [                                   // one per user note: shown in the After panel
    {"q": "Why two writers?", "a": "One writer now, through the queue.", "ids": ["store", "queue"]}
  ]
}
```

A patch replaces the fields it names. `status` is `changed` (blue edge), `removed` (struck, red)
or `same`. `note: null` clears the red dot; a new `note` replaces it. Arrows touching a removed
box disappear in After. New boxes can sit in an `after_only` zone or any other zone, and a
column may list them.

## threads

```jsonc
"threads": {
  "node:store": [
    {"id": "n3f2ab", "by": "user", "view": "before", "text": "Why do two writers exist?"},
    {"by": "agent", "text": "Retries were added in 2024 (commit 81c2…) and …"}
  ],
  "edge:parse>store": [ … ],
  "page": [ … ]
}
```

Keys are `page`, `node:<id>` or `edge:<from>><to>`. Copy each user note's `id` from the pasted
block: the page then removes it from the reader's unsent notes. `text` takes `code` spans.

## Links

`<page>.html#before`, `#after`, `#after/node:<id>`, `#before/edge:<from>><to>` open a view with a
box or an arrow selected.
