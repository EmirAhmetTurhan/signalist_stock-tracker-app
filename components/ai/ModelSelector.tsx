'use client';

import { useState, useEffect } from 'react';
import { Cpu, ChevronDown, Key, Globe, Monitor, Check } from 'lucide-react';
import { MODEL_CATEGORIES, API_KEY_PROVIDERS, type ModelEntry } from '@/lib/ai/model-registry';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Props = {
  selectedModel?: string;
  onSelect: (modelId: string) => void;
};

const STORAGE_KEY = 'signalist-user-api-key';
const PROVIDER_STORAGE = 'signalist-api-provider';

export default function ModelSelector({ selectedModel, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiProvider, setApiProvider] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  // Load saved state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const prov = localStorage.getItem(PROVIDER_STORAGE);
    if (saved) { setApiKey(saved); setKeySaved(true); }
    if (prov) setApiProvider(prov);
  }, []);

  // Current label
  let currentLabel = 'Local';
  for (const cat of MODEL_CATEGORIES) {
    const f = cat.models.find((m) => m.id === selectedModel);
    if (f) { currentLabel = f.label; break; }
  }
  if (!currentLabel || currentLabel === 'Local') {
    for (const p of API_KEY_PROVIDERS) {
      const f = p.models.find((m) => m.id === selectedModel);
      if (f) { currentLabel = f.label; break; }
    }
  }

  const saveKey = () => {
    if (!apiKey.trim()) return;
    localStorage.setItem(STORAGE_KEY, apiKey.trim());
    if (apiProvider) localStorage.setItem(PROVIDER_STORAGE, apiProvider);
    setKeySaved(true);
  };

  const clearKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROVIDER_STORAGE);
    setApiKey('');
    setApiProvider('');
    setKeySaved(false);
    onSelect('ollama:qwen3:14b');
  };

  const hasKey = keySaved && apiKey.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
            bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 border border-gray-700/30 transition-colors"
          title={currentLabel}
        >
          {selectedModel?.startsWith('ollama') ? <Monitor className="h-3 w-3 text-green-500" /> : <Globe className="h-3 w-3 text-blue-400" />}
          <span className="max-w-[80px] truncate">{currentLabel}</span>
          <ChevronDown className={`h-3 w-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-72 p-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[9999] max-h-[70vh] overflow-y-auto"
      >
        {/* Local models */}
        {MODEL_CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <div className="px-3 py-1.5 bg-gray-800/50 flex items-center gap-1.5">
              <Monitor className="h-3 w-3 text-green-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{cat.title}</span>
            </div>
            {cat.models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onSelect(m.id); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 pl-6 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${
                  selectedModel === m.id ? 'text-green-400 bg-gray-700/50' : 'text-gray-300'
                }`}
              >
                <div>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-gray-500 ml-1.5 text-[10px]">{m.description}</span>
                </div>
                {selectedModel === m.id && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
              </button>
            ))}
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-gray-700/50" />

        {/* API Key section */}
        <div className="px-3 py-2 bg-gray-800/30">
          <div className="flex items-center gap-1.5 mb-2">
            <Key className="h-3 w-3 text-gray-500" />
            <span className="text-[10px] text-gray-400">Your API Key</span>
            {hasKey && <Check className="h-3 w-3 text-green-500" />}
          </div>

          {/* Provider selector */}
          <select
            value={apiProvider}
            onChange={(e) => setApiProvider(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-[10px] text-gray-300 mb-1.5 focus:outline-none focus:border-yellow-500/30"
          >
            <option value="">Select provider...</option>
            {API_KEY_PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>{p.title} — {p.description}</option>
            ))}
          </select>

          {/* Key input */}
          <div className="flex gap-1.5">
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeySaved(false); }}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-yellow-500/30"
            />
            <button
              onClick={saveKey}
              disabled={!apiKey.trim() || !apiProvider}
              className="px-2 py-1 rounded-md text-[10px] font-medium bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              Save
            </button>
          </div>

          {hasKey && (
            <button onClick={clearKey} className="text-[9px] text-gray-500 hover:text-red-400 mt-1 transition-colors">
              Clear key
            </button>
          )}
        </div>

        {/* Cloud models — only shown when key is saved */}
        {hasKey && apiProvider && API_KEY_PROVIDERS.filter(p => p.key === apiProvider).map((p) => (
          <div key={p.key}>
            <div className="border-t border-gray-700/50" />
            <div className="px-3 py-1.5 bg-gray-800/50 flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{p.title} Models</span>
            </div>
            {p.models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onSelect(m.id); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 pl-6 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${
                  selectedModel === m.id ? 'text-blue-400 bg-gray-700/50' : 'text-gray-300'
                }`}
              >
                <div>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-gray-500 ml-1.5 text-[10px]">{m.description}</span>
                </div>
                {selectedModel === m.id && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
              </button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
