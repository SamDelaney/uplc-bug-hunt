// "Report an issue" links, shared by both pages. The site has no server, so a link opens GitHub's
// new-issue form with the title and body filled in; the reporter reviews it and submits it there.
const ISSUES_URL = "https://github.com/samdelaney/uplc-bug-hunt/issues/new";
// GitHub answers 414 once the whole URL is much over 8,000 characters, so pasted code is capped.
const MAX_CODE = 3000;

function issueUrl({ title, where, code }) {
  const lines = [`**Where:** ${where}`, "", "**What's wrong:**", "", ""];
  if (code) {
    const cut = code.length > MAX_CODE;
    lines.push("**My code:**", "", "```", cut ? code.slice(0, MAX_CODE) : code, "```");
    if (cut) lines.push("", "(Code cut to fit the link. Paste the rest if it matters.)");
  }
  const q = new URLSearchParams({ title, body: lines.join("\n"), labels: "bug" });
  return `${ISSUES_URL}?${q}`;
}

// The link is rebuilt just before it's followed, so it always describes what's on screen.
// The href in the HTML is the blank form, so the link still works if this script doesn't run.
function bindReport(link, describe) {
  const refresh = () => { link.href = issueUrl(describe()); };
  for (const ev of ["pointerdown", "focus", "click", "auxclick"]) link.addEventListener(ev, refresh);
  refresh();
}
