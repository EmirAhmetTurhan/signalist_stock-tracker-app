'use client';

import { ExternalLink, Newspaper } from 'lucide-react';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

type NewsArticle = {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: number;
  url?: string;
};

export default function NewsListCard({ data }: Props) {
  const articles = (data.articles as NewsArticle[]) || [];

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 px-3 py-2.5">
        <span className="text-xs text-gray-500">No recent news found.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Newspaper className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Market News ({articles.length})</span>
      </div>
      <div className="space-y-2">
        {articles.slice(0, 4).map((a, i) => (
          <a
            key={i}
            href={a.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg px-2.5 py-2 hover:bg-gray-700/40 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-200 leading-snug line-clamp-2 group-hover:text-yellow-300">
                  {a.headline || 'Untitled'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {a.source && <span className="text-[10px] text-gray-500">{a.source}</span>}
                  {a.datetime && (
                    <span className="text-[10px] text-gray-600">
                      {new Date(a.datetime * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink className="h-3 w-3 text-gray-600 group-hover:text-gray-400 shrink-0 mt-0.5" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
