# Joule plugins

Card plugins for [Joule](https://joule.sh). A plugin teaches a deployment to
**draw** an answer instead of restating it: a Linear cycle becomes a card with
its dates and progress, a ticket list becomes rows you can click, and the model
stops relaying JSON through prose.

Install one straight from this repository:

```
POST /card-plugins/from-source
{"sourceUrl": "https://raw.githubusercontent.com/joule-sh/plugins/main/plugins/linear-cards.json"}
```

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

## Renderers live in the console

A manifest is data. It ships no code, and nothing executable is fetched at
install time — a plugin that could ship its own drawing code would be a way to
put somebody else's markup inside a transcript, which is a bad trade for a
progress bar. The console looks a renderer up **by marker**; a marker it has no
renderer for degrades to the model's own visible line, never to a blank.

So a new marker needs a renderer contributed to the console
(`app/src/cards.ts` in `std-contrib`) — or reuse an existing marker if your
tool's result has the same shape.

## Contributing

1. Add `plugins/<your-plugin>.json`.
2. Add a row to `index.json`.
3. Say in the PR which connector it is for and which tools it draws.

Keep cases to one line each. A plugin that writes a paragraph into every
conversation has taken the context budget from the conversation, and the budget
is what the answer is drawn from.
