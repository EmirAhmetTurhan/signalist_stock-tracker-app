'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-gray-100 mt-3 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-gray-100 mt-3 mb-1.5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-300 leading-relaxed my-1.5">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-yellow-400">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-0.5 my-1.5 text-sm text-gray-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-0.5 my-1.5 text-sm text-gray-300">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-gray-300">{children}</li>
  ),
  code: ({ className, children }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-gray-700/50 text-yellow-400 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
    ) : (
      <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto">
        <code className="text-xs text-gray-200 font-mono">{children}</code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-yellow-500/50 pl-3 my-2 text-sm text-gray-400 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-gray-700 my-3" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300 underline">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-700 bg-gray-800 px-3 py-1.5 text-left text-gray-200 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-700 px-3 py-1.5 text-gray-300">{children}</td>
  ),
};

export default memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
});
