'use client';

import { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Key, Globe, Monitor, Plus } from 'lucide-react';
import { MODEL_CATEGORIES, type ModelEntry } from '@/lib/ai/model-registry';

type Props = {
  selectedModel?: string;
  onSelect: (modelId: string) => void;
};

export default function ModelSelector({ selectedModel, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Find selected model label across all categories
  let currentLabel = 'Local';
  for (const cat of MODEL_CATEGORIES) {
    const found = cat.models.find((m) => m.id === selectedModel);
    if (found) { currentLabel = found.label; break; }
  }
  if (selectedModel?.startsWith('ollama:')) {
    const custom = selectedModel.slice(7);
    if (!MODEL_CATEGORIES[0].models.find((m) => m.id === selectedModel)) {
      currentLabel = custom;
    }
  }

  const iconFor = (key: string) => {
    if (key === 'ollama') return <Monitor className="h-3 w-3 shrink-0" />;
    if (key === 'groq' || key === 'openrouter') return <Globe className="h-3 w-3 shrink-0" />;
    return <Cpu className="h-3 w-3 shrink-0" />;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
          bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 border border-gray-700/30
          transition-colors"
        title={currentLabel}
      >
        <Cpu className="h-3 w-3 text-gray-500" />
        <span className="max-w-[80px] truncate">{currentLabel}</span>
        <ChevronDown className={`h-3 w-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {MODEL_CATEGORIES.map((cat, catIdx) => (
            <div key={cat.key}>
              {catIdx > 0 && <div className="border-t border-gray-700/50" />}
              <div className="px-3 py-1.5 bg-gray-800/50">
                <div className="flex items-center gap-1.5">
                  {iconFor(cat.key)}
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{cat.title}</span>
                </div>
              </div>
              {cat.models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 pl-6 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${
                    selectedModel === m.id ? 'text-yellow-400 bg-gray-700/50' : 'text-gray-300'
                  }`}
                >
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-gray-500 ml-1.5 text-[10px]">{m.description}</span>
                  </div>
                  {selectedModel === m.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                  )}
                </button>
              ))}

              {/* API Key Input (Future expansion) */}
              <div className="px-3 py-2 border-t border-gray-700/50 bg-gray-800/30">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Key className="h-3 w-3 text-gray-500" />
                  <span className="text-[10px] text-gray-400">API Anahtari (Opsiyonel)</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    placeholder="sk-..."
                    defaultValue={typeof window !== 'undefined' ? localStorage.getItem('signalist-user-api-key') || '' : ''}
                    onChange={(e) => {
                      if (typeof window !== 'undefined') {
                        if (e.target.value) {
                          localStorage.setItem('signalist-user-api-key', e.target.value);
                        } else {
                          localStorage.removeItem('signalist-user-api-key');
                        }
                      }
                    }}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-yellow-500/30"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
