import type { ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * 相対URLと明示的に許可したスキームだけを通す。
 * protocol-relative URLやjavascript/dataスキームは空URLに変換する。
 */
export function safeMarkdownUrl(url: string): string {
  const value = url.trim();
  if (value.startsWith("//")) return "";

  const scheme = value.match(/^([a-z][a-z\d+.-]*:)/i)?.[1].toLowerCase();
  if (scheme && !ALLOWED_URL_SCHEMES.has(scheme)) return "";
  return defaultUrlTransform(value);
}

function ExternalSafeLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) {
    return <span className="wiki-markdown-unsafe-link">{children}</span>;
  }
  const isExternal = /^https?:\/\//i.test(href ?? "");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer noopener" : undefined}
    >
      {children}
    </a>
  );
}

/** 生HTMLを実行せず、管理者が入力したMarkdownだけを安全に表示する。 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="wiki-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={{
          // アプリ全体のh1とページ見出しh2を飛び越えない階層に補正する。
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          h5: ({ children }) => <h6>{children}</h6>,
          h6: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children }) => (
            <ExternalSafeLink href={href}>{children}</ExternalSafeLink>
          ),
          table: ({ children }) => (
            <div className="wiki-markdown-table">
              <table>{children}</table>
            </div>
          ),
          // 外部画像の追跡・巨大画像によるレイアウト変動を防ぐ。
          img: ({ alt }) => (
            <span className="wiki-markdown-image-note">
              {alt ? `画像「${alt}」は表示されません` : "画像は表示されません"}
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
