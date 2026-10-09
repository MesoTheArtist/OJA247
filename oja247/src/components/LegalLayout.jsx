import React from "react";
import { Link } from "react-router-dom";

// Renders the small markdown subset the policy files use: ## and ### headings,
// paragraphs, "- " bullets, "1. " numbered lists, **bold** and [text](link).
// Built as React elements (never raw HTML), so edited content can't inject code.

function renderInline(text, keyPrefix) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      out.push(
        href.startsWith("/") ? (
          <Link key={`${keyPrefix}-${i++}`} to={href} className="text-green-700 underline font-medium">
            {label}
          </Link>
        ) : (
          <a key={`${keyPrefix}-${i++}`} href={href} className="text-green-700 underline font-medium">
            {label}
          </a>
        )
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));

  // Turn a bare support address into a mailto link.
  return out.flatMap((part, idx) => {
    if (typeof part !== "string") return [part];
    const pieces = part.split(/(support@oja247\.store)/g);
    return pieces.map((piece, j) =>
      piece === "support@oja247.store" ? (
        <a key={`${keyPrefix}-m-${idx}-${j}`} href="mailto:support@oja247.store" className="text-green-700 underline font-medium">
          {piece}
        </a>
      ) : (
        piece
      )
    );
  });
}

function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (line.startsWith("### ")) {
      flushPara();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (/^[-*] /.test(line)) {
      flushPara();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(line.slice(2));
    } else if (/^\d+\. /.test(line)) {
      flushPara();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(line.replace(/^\d+\. /, ""));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

const LegalLayout = ({ title, subtitle, updated, content }) => {
  const blocks = parseBlocks(content);

  return (
    <div className="bg-white min-h-screen">
      <div className="bg-gradient-to-b from-green-50 to-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 pt-28 pb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900">{title}</h1>
          {subtitle && <p className="mt-3 text-gray-600">{subtitle}</p>}
          {updated && <p className="mt-3 text-sm text-gray-400">Last updated {updated}</p>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 text-gray-700 leading-relaxed">
        {blocks.map((b, i) => {
          if (b.type === "h2") {
            return (
              <h2 key={i} className="text-xl font-bold text-gray-900 mt-10 mb-3">
                {renderInline(b.text, `h${i}`)}
              </h2>
            );
          }
          if (b.type === "h3") {
            return (
              <h3 key={i} className="text-base font-bold text-gray-900 mt-6 mb-1">
                {renderInline(b.text, `h${i}`)}
              </h3>
            );
          }
          if (b.type === "ul") {
            return (
              <ul key={i} className="list-disc pl-6 space-y-2 my-4">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>
                ))}
              </ul>
            );
          }
          if (b.type === "ol") {
            return (
              <ol key={i} className="list-decimal pl-6 space-y-2 my-4">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>
                ))}
              </ol>
            );
          }
          return (
            <p key={i} className="my-4">
              {renderInline(b.text, `p${i}`)}
            </p>
          );
        })}

        <div className="mt-12 pt-6 border-t border-gray-100 text-sm text-gray-500 flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/terms" className="hover:text-green-700">Terms &amp; Conditions</Link>
          <Link to="/vendor-terms" className="hover:text-green-700">Seller Terms</Link>
          <Link to="/privacy" className="hover:text-green-700">Privacy Policy</Link>
          <Link to="/delivery-information" className="hover:text-green-700">Delivery &amp; Payments</Link>
          <Link to="/help" className="hover:text-green-700">Help Center</Link>
        </div>
      </div>
    </div>
  );
};

export default LegalLayout;