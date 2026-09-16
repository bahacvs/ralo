import React from 'react';

/** Legal texts link to each other as sibling .md files; these are the ones published under /yasal. */
const PUBLISHED_SLUGS = ['kullanim-kosullari', 'kvkk-aydinlatma-metni', 'acik-riza-metni', 'kulup-hizmet-sozlesmesi'];

/** Inline markdown: **bold**, *italic*, `code` and [links](...). Produces React nodes only (no raw HTML). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key} className="px-1 rounded bg-slate-100 dark:bg-slate-800 text-[0.9em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      const slug = href.replace(/^\.\//, '').replace(/\.md(#.*)?$/, '');
      if (PUBLISHED_SLUGS.includes(slug)) {
        nodes.push(<a key={key} href={`/yasal/${slug}`} className="text-amber-700 dark:text-amber-400 underline">{label}</a>);
      } else if (/^https?:\/\//.test(href)) {
        nodes.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-400 underline">{label}</a>);
      } else {
        nodes.push(label);
      }
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

export const LegalMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const k = `b${key++}`;

    if (!trimmed) {
      i++;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      blocks.push(<hr key={k} className="my-6 border-slate-200 dark:border-slate-800" />);
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? 'text-2xl font-black mt-2' : level === 2 ? 'text-lg font-extrabold mt-6' : 'text-base font-bold mt-4';
      const Tag = (`h${Math.min(level + 1, 4)}`) as 'h2' | 'h3' | 'h4';
      blocks.push(<Tag key={k} className={`${cls} text-slate-900 dark:text-white`}>{renderInline(heading[2], k)}</Tag>);
      i++;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k} className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-1">
          {quote.map((q, n) => <p key={n}>{renderInline(q, `${k}-${n}`)}</p>)}
        </blockquote>
      );
      continue;
    }
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i++].trim();
        if (!/^\|?[\s:|-]+$/.test(row)) rows.push(splitRow(row));
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k} className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 dark:border-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>{head?.map((cell, n) => <th key={n} scope="col" className="p-2 text-left font-bold border-b border-slate-200 dark:border-slate-800">{renderInline(cell, `${k}-h${n}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-b border-slate-100 dark:border-slate-800 align-top">
                  {row.map((cell, n) => <td key={n} className="p-2">{renderInline(cell, `${k}-${r}-${n}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i++].trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''));
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
          {items.map((item, n) => <li key={n}>{renderInline(item, `${k}-${n}`)}</li>)}
        </List>
      );
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||[-*]\s|\d+\.\s|---+$)/.test(lines[i].trim())) {
      paragraph.push(lines[i++].trim());
    }
    blocks.push(<p key={k}>{renderInline(paragraph.join(' '), k)}</p>);
  }

  return <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{blocks}</div>;
};
