// Linear cards, drawn from the tool result — the reference renderer.
//
// The contract (documented in the repo README): this module default-exports a
// list of { marker, render }. `render(content, evidence)` is a pure function
// from strings to an HTML string — `content` is the short JSON the model put
// inside the marker, `evidence` is the raw text of every JSON-shaped tool
// result of the turn. It runs inside the console's sandboxed iframe: no
// cookies, no storage, no network, no DOM beyond the string it returns — and
// the returned string is sanitized by the console before it is shown, so
// scripts and event handlers would be stripped even if one were emitted.
//
// Read the numbers out of `evidence`, never out of `content`: the model is
// asked to contribute a team name or a heading and nothing else, because a
// model transcribing fourteen fields through prose drops some of them at any
// size worth running.

function esc(raw) {
  var out = "";
  var s = String(raw);
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else out += ch;
  }
  return out;
}

// A tool result parsed even when the engine appended briefing prose after the
// JSON — which it does: card hints ride the result's tail. The JSON is the
// prefix, so walk back from the end.
//
// It also has to survive a TRUNCATED result, which is a real case rather than
// a defensive one: the engine stores a preview of each tool result, and a
// listing longer than the cap arrives cut mid-object. Walking back from the
// end finds the longest parsable prefix — which for `{"issues":[…` cut in
// half is nothing at all, and the renderer then draws nothing rather than
// drawing a card with half a list in it. Half a list is worse than no card:
// a reader cannot tell it is half.
function parseLoose(text) {
  var t = String(text).trim();
  try { return JSON.parse(t); } catch (e) { /* appended prose */ }
  var from = t.search(/[[{]/);
  if (from === -1) return null;
  for (var end = t.length; end > from; end--) {
    var ch = t[end - 1];
    if (ch !== "}" && ch !== "]") continue;
    try { return JSON.parse(t.slice(from, end)); } catch (e) { /* keep walking */ }
  }
  return null;
}

function last(ns) {
  return Array.isArray(ns) && ns.length > 0 && isFinite(ns[ns.length - 1])
    ? ns[ns.length - 1] : 0;
}

function day(iso) {
  if (typeof iso !== "string" || iso === "") return "";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stateInk(statusType) {
  if (statusType === "completed") return { ink: "#2f8a4c", bg: "rgba(47,138,76,.12)" };
  if (statusType === "started") return { ink: "#b7791f", bg: "rgba(183,121,31,.12)" };
  if (statusType === "canceled") return { ink: "#8a8f98", bg: "rgba(138,143,152,.12)" };
  return { ink: "#6b7280", bg: "rgba(107,114,128,.12)" };
}

var BORDER = "var(--nuraly-border-color,rgba(128,128,128,.25))";

function cyclesFromEvidence(evidence) {
  for (var i = 0; i < evidence.length; i++) {
    var data = parseLoose(evidence[i]);
    if (Array.isArray(data) && data.length > 0
        && typeof data[0].number === "number"
        && typeof data[0].startsAt === "string") {
      return data;
    }
  }
  return [];
}

function issuesFromEvidence(evidence) {
  for (var i = 0; i < evidence.length; i++) {
    var data = parseLoose(evidence[i]);
    if (data !== null && Array.isArray(data.issues) && data.issues.length > 0
        && typeof data.issues[0].title === "string") {
      return data.issues;
    }
  }
  return [];
}

// The workspace's own states when the turn looked them up, else Linear's
// defaults. A workspace with custom states gets them as soon as the model has
// called list_issue_statuses; until then the four every workspace has.
function statusesFromEvidence(evidence) {
  for (var i = 0; i < evidence.length; i++) {
    var data = parseLoose(evidence[i]);
    var list = data && Array.isArray(data.statuses) ? data.statuses : null;
    if (list && list.length > 0) {
      var names = [];
      for (var k = 0; k < list.length; k++) {
        var name = typeof list[k] === "string" ? list[k] : (list[k] && list[k].name);
        if (typeof name === "string" && name !== "") { names.push(name); }
      }
      if (names.length > 0) { return names.slice(0, 6); }
    }
  }
  return ["Todo", "In Progress", "Done", "Canceled"];
}

function renderCycle(content, evidence) {
  var d;
  try { d = JSON.parse(content); } catch (e) { return ""; }
  var cycles = cyclesFromEvidence(evidence);
  var cycle = null;
  for (var i = 0; i < cycles.length; i++) {
    if (cycles[i].isCurrent === true) { cycle = cycles[i]; break; }
  }
  if (cycle === null) { cycle = cycles[cycles.length - 1]; }
  if (!cycle) return "";

  var team = typeof d.team === "string" && d.team.trim() !== ""
    ? esc(d.team.slice(0, 48)) : "";
  var title = cycle.name && String(cycle.name).trim() !== ""
    ? esc(String(cycle.name).slice(0, 64))
    : "Cycle " + (typeof cycle.number === "number" ? cycle.number : "?");
  var from = day(cycle.startsAt), to = day(cycle.endsAt);
  var span = from !== "" && to !== "" ? from + " – " + to : from + to;
  var scope = last(cycle.scopeHistory) || last(cycle.issueCountHistory);
  var done = last(cycle.completedScopeHistory) || last(cycle.completedIssueCountHistory);
  var issues = last(cycle.issueCountHistory);
  var doneIssues = last(cycle.completedIssueCountHistory);
  var pct = scope > 0 ? Math.round((done / scope) * 100) : 0;

  return '<div data-linear-card="cycle" style="margin:10px 0;padding:14px 16px;border:1px solid ' + BORDER + ';border-radius:12px;max-width:440px;font-family:inherit">'
    + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">'
    + '<span style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.6">Linear' + (team === "" ? "" : " · " + team) + '</span>'
    + (cycle.isCurrent === true ? '<span style="font-size:10.5px;font-weight:600;color:#2f8a4c;border:1px solid rgba(47,138,76,.4);border-radius:999px;padding:0 7px">current</span>' : "")
    + '</div>'
    + '<div style="font-size:18px;font-weight:600;line-height:1.3">' + title + '</div>'
    + (span === "" ? "" : '<div style="font-size:12.5px;opacity:.65;margin-top:2px">' + span + '</div>')
    + '<div style="margin-top:10px;height:6px;border-radius:999px;background:rgba(128,128,128,.15);overflow:hidden">'
    + '<div style="height:100%;width:' + pct + '%;border-radius:999px;background:#2f8a4c"></div></div>'
    + '<div style="font-size:12.5px;opacity:.75;margin-top:6px">' + doneIssues + ' of ' + issues + ' issues done · ' + pct + '% of scope</div>'
    + '</div>';
}

function renderIssues(content, evidence) {
  var d;
  try { d = JSON.parse(content); } catch (e) { return ""; }
  var all = issuesFromEvidence(evidence);
  if (all.length === 0) return "";
  var shown = all.slice(0, 10);

  // The states a row can be moved to. Read from the evidence when the turn
  // fetched them (list_issue_statuses), else the four Linear ships with —
  // named rather than guessed, so a workspace with custom states gets its own
  // the moment the model has looked them up.
  var states = statusesFromEvidence(evidence);

  var rows = "";
  for (var i = 0; i < shown.length; i++) {
    var issue = shown[i];
    var key = esc(String(issue.id || "").slice(0, 16));
    var title = esc(String(issue.title || "").slice(0, 160));
    var st = String(issue.statusType || "");
    var chip = stateInk(st);
    var status = esc(String(issue.status || "").slice(0, 24));
    var pr = issue.priority && typeof issue.priority.value === "number" && issue.priority.value > 0
      ? '<span style="font-size:11px;opacity:.55;flex:none">' + esc(String(issue.priority.name || "").slice(0, 12)) + '</span>' : "";
    var due = typeof issue.dueDate === "string" && issue.dueDate !== ""
      ? '<span style="font-size:11px;opacity:.55;flex:none">due ' + esc(day(issue.dueDate)) + '</span>' : "";
    var struck = st === "canceled" ? "text-decoration:line-through;opacity:.6;" : "";

    // Only Linear's own host becomes a link.
    var url = String(issue.url || "");
    var safe = /^https:\/\/linear\.app\//.test(url) ? esc(url) : "";
    var link = safe === ""
      ? ""
      : '<a href="' + safe + '" target="_blank" rel="noopener noreferrer"'
        + ' style="font-size:11.5px;color:inherit;opacity:.6">Open in Linear &#8599;</a>';

    // The body: description, and the moves. `details`/`summary` rather than a
    // click handler, because the sanitizer strips every handler a renderer
    // could write — correctly — and a disclosure needs none. The browser owns
    // the open state, so it survives a re-render of the surrounding message.
    var body = String(issue.description || "").trim();
    var described = body === ""
      ? '<div style="font-size:12.5px;opacity:.5">No description.</div>'
      : '<div style="font-size:13px;line-height:1.55;white-space:pre-wrap;opacity:.8">'
        + esc(body.slice(0, 1200)) + (body.length > 1200 ? "&hellip;" : "") + '</div>';

    // The moves. data-card-send carries the SENTENCE the console will send as
    // a message — the card composes a turn, the model calls the tool, and the
    // transcript records that the issue moved. Nothing here reaches Linear.
    var moves = "";
    for (var m = 0; m < states.length; m++) {
      if (states[m].toLowerCase() === String(issue.status || "").toLowerCase()) { continue; }
      var to = esc(states[m]);
      moves += '<button type="button" data-card-send="Move ' + esc(String(issue.id || ""))
        + ' to ' + to + ' in Linear."'
        + ' style="font:inherit;font-size:11.5px;padding:3px 10px;border-radius:999px;'
        + 'cursor:pointer;background:none;color:inherit;border:1px solid ' + BORDER + ';opacity:.85">'
        + to + '</button>';
    }
    var actions = moves === "" ? "" :
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px">'
      + '<span style="font-size:11px;opacity:.5;margin-right:2px">Move to</span>' + moves + '</div>';

    rows += '<details style="border-top:1px solid ' + BORDER + '">'
      + '<summary style="display:flex;align-items:center;gap:10px;padding:8px 12px;'
      + 'cursor:pointer;list-style:none">'
      + '<span style="font:600 11.5px ui-monospace,monospace;opacity:.55;flex:none">' + key + '</span>'
      + '<span style="flex:1;min-width:0;font-size:13.5px;' + struck
      + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + title + '</span>'
      + pr + due
      + '<span style="flex:none;font-size:11px;font-weight:600;color:' + chip.ink
      + ';background:' + chip.bg + ';border-radius:999px;padding:2px 9px">' + status + '</span>'
      + '</summary>'
      + '<div style="padding:2px 12px 12px 12px;display:flex;flex-direction:column;gap:8px">'
      + described + actions
      + (link === "" ? "" : '<div>' + link + '</div>')
      + '</div></details>';
  }

  var title2 = typeof d.title === "string" && d.title.trim() !== ""
    ? esc(d.title.slice(0, 64)) : "Issues";
  var more = all.length > shown.length
    ? '<div style="padding:7px 12px;border-top:1px solid ' + BORDER + ';font-size:12px;opacity:.6">and ' + (all.length - shown.length) + ' more</div>' : "";

  return '<div data-linear-card="issues" style="margin:10px 0;border:1px solid ' + BORDER + ';border-radius:12px;max-width:640px;font-family:inherit;overflow:hidden">'
    + '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px">'
    + '<span style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.6">Linear &middot; ' + title2 + '</span>'
    + '<span style="flex:1"></span>'
    + '<span style="font-size:11.5px;opacity:.55">' + all.length + ' issue' + (all.length === 1 ? "" : "s") + '</span>'
    + '</div>' + rows + more + '</div>';
}

export default [
  { marker: "LINEAR_CYCLE", render: renderCycle },
  { marker: "LINEAR_ISSUES", render: renderIssues },
];
