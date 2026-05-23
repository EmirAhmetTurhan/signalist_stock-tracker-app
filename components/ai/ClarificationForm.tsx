'use client';

import React, { useState } from 'react';
import { HelpCircle, Send } from 'lucide-react';

interface ClarificationFormProps {
  question: string;
  options?: string[];
  onFollowUp?: (text: string) => void;
}

export default function ClarificationForm({ question, options, onFollowUp }: ClarificationFormProps) {
  const [customText, setCustomText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (text: string) => {
    if (!text.trim() || !onFollowUp || submitted) return;
    setSubmitted(true);
    onFollowUp(text);
  };

  return (
    <div className="bg-white/5 border border-yellow-500/30 rounded-xl p-4 my-2 relative overflow-hidden group">
      {/* Background glow */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-yellow-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-yellow-500/20 transition-all duration-500" />
      
      <div className="flex items-start gap-3 relative z-10">
        <div className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg shrink-0 mt-0.5">
          <HelpCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-medium mb-3">{question}</h4>
          
          <div className="space-y-3">
            {/* Options */}
            {options && options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleSubmit(opt)}
                    disabled={submitted}
                    className="px-3 py-1.5 bg-white/5 hover:bg-yellow-500/20 border border-white/10 hover:border-yellow-500/30 rounded-lg text-sm text-gray-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Custom Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(customText)}
                disabled={submitted}
                placeholder="Diğer (kendin yaz)..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={() => handleSubmit(customText)}
                disabled={!customText.trim() || submitted}
                className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
