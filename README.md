# Joule plugins

Card plugins for [Joule](https://joule.sh). A plugin teaches a deployment to
**draw** an answer instead of restating it: a Linear cycle becomes a card with
its dates and progress, a ticket list becomes rows you can click, and the model
stops relaying JSON through prose.

Install one straight from this repository:

```
POST /card-plugins/from-source
{"sourceUrl": "https://cdn.jsdelivr.net/gh/joule-sh/plugins@main/plugins/linear-cards.json"}
```

Use the CDN address, not `raw.githubusercontent.com`. The engine fetches a
manifest server-side, where either works — but raw GitHub serves every file as
`text/plain` with no CORS header and a `sandbox` CSP, so the moment anything is
fetched by a *browser* the raw URL stops working and the failure looks like a
broken plugin rather than a wrong host. jsDelivr sends the right content type,
allows cross-origin reads, and caches. Pin a tag instead of `@main` once you
have released one: `@v1.0.0` is immutable, `@main` changes under installs.

## What a plugin is

One JSON file. It carries **cards** — which tool result becomes which marker —
and **cases** — when to reach for them.

```json
{
  "id": "linear-cards",
  "pluginName": "Linear cards",
  "description": "Draws Linear cycles and issue lists as cards instead of prose.",
  "version": "1.0.0",
  "cards": [
    {
      "toolName": "list_cycles",
      "marker": "LINEAR_CYCLE",
      "payload": "{\"team\":\"<team name>\"}",
      "hint": ""
    }
  ],
  "cases": [
    {
      "when": "a sprint or cycle, its dates, scope or progress",
      "then": "call list_cycles (list_teams first if you need the team id), then emit [LINEAR_CYCLE]"
    }
  ]
}
```

Both halves are needed, and they act at different moments:

- A **card** rides the *result* of a call that already happened. The engine
  appends its hint to that tool's successful output, so the model reads "emit
  this marker" immediately before it writes — which is the only position a
  small model reliably follows.
- A **case** goes in the system prompt, before the model has chosen anything.
  A card hint cannot help with "is this question one of ours"; by then prose
  has already been picked.

### Fields

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case. Also namespaces the rows the install creates. |
| `pluginName` | What it is called in the list somebody manages it from. |
| `version` | Yours. Recorded, never interpreted. |
| `cards[].toolName` | The tool whose **successful** result carries the hint. |
| `cards[].marker` | `UPPER_SNAKE` only. Becomes `[MARKER]…[/MARKER]` in the reply. |
| `cards[].payload` | The short JSON the model writes — a name or a heading. **Never a number.** |
| `cards[].hint` | Override the default sentence. `""` uses the default, which is what you want. |
| `cases[].when` | The kind of question, in the words a person would use. |
| `cases[].then` | What to do about it: which tool, then which marker. |

## The rule that makes cards trustworthy

**The model never carries the data.** It emits a marker and a heading; the
console reads every number, id, date and url out of the tool result the card
was raised from. A model asked to transcribe fourteen fields through prose
drops some of them at any size worth running — so it is not asked to.

That is why `payload` holds a team name and not an issue count.

## Renderers ship with the plugin, and run in a sandbox

A plugin folder holds its renderer as source:

```
plugins/<id>/manifest.json    "renderer": "./renderer.js"
plugins/<id>/renderer.js      export default [{ marker, render }]
```

At install the engine fetches the renderer once and **snapshots it** — the
code a deployment runs is the code its operator installed, not whatever the
URL serves later, and a CDN outage cannot take cards down. A version bump is a
reinstall, on purpose: an install is a decision.

The console executes renderers inside a sandboxed iframe: **null origin, no
cookies, no storage, no network, no reach into the page**. `render(content,
evidence)` is a pure function from strings to an HTML string — `content` is
the model's short JSON, `evidence` is the raw text of the turn's JSON-shaped
tool results. The returned HTML is sanitized before insertion (scripts, event
handlers and non-https urls are stripped), and a renderer that is missing,
slow or broken degrades to the model's own visible line, never to a blank.

Renderer ground rules:

- plain JS, one file, no imports — the sandbox has no module graph beyond it
- no `fetch`, no timers that outlive the render, budget ~50ms per call
- read every number, id and url from `evidence`, never from `content`
- escape everything you interpolate; the sanitizer is the net, not the plan

## Contributing

1. Add `plugins/<your-plugin>.json`.
2. Add a row to `index.json`.
3. Say in the PR which connector it is for and which tools it draws.

Keep cases to one line each. A plugin that writes a paragraph into every
conversation has taken the context budget from the conversation, and the budget
is what the answer is drawn from.
