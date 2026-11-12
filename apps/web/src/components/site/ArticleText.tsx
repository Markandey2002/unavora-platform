// Shared by the public article page and the staff preview.
/** Plain-text article body: blank line = paragraph, "## " line = subheading, "- " lines = list. No HTML is rendered. */
export function ArticleText({ text }: { text: string }) {
  // Browsers submit textarea line breaks as CRLF; normalise before splitting.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(<p key={out.length} className="mt-5 whitespace-pre-line">{para.join("\n")}</p>);
    if (list.length) out.push(<ul key={out.length} className="mt-5 list-disc space-y-2 pl-6">{list.map((l, j) => <li key={j}>{l}</li>)}</ul>);
    para = []; list = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (l.startsWith("## ")) { flush(); out.push(<h2 key={out.length} className="font-display mt-10 text-3xl font-semibold">{l.slice(3)}</h2>); continue; }
    if (l.startsWith("- ")) { if (para.length) flush(); list.push(l.slice(2)); continue; }
    if (list.length) flush();
    para.push(l);
  }
  flush();
  return <>{out}</>;
}
