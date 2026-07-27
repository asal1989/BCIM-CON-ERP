// src/components/copilot/CopilotPanel.jsx
// Docked chat drawer for the Bill Tracker AI Copilot pilot. Structural
// pattern copied from NotificationPanel.jsx (backdrop + absolute panel).
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, AlertTriangle, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copilotAPI } from '../../api/client';

const MAX_HISTORY_SENT = 10;

// Strip markdown syntax before handing text to the speech synthesizer --
// "**Rs 4,50,000**" read aloud verbatim would say "asterisk asterisk Rs...".
function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/\|/g, ' ')
    .replace(/[*_#`]/g, '')
    .replace(/^-+\s*/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .trim();
}

const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
const speechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <div className="font-bold text-[14px] mb-1.5">{children}</div>,
  h2: ({ children }) => <div className="font-bold text-[13.5px] mb-1.5">{children}</div>,
  h3: ({ children }) => <div className="font-bold text-[13px] mb-1">{children}</div>,
  code: ({ children }) => <code className="bg-slate-200 rounded px-1 py-0.5 text-[12px] font-mono">{children}</code>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0 -mx-1">
      <table className="min-w-full text-[12px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-200/70">{children}</thead>,
  th: ({ children }) => <th className="border border-slate-300 px-2 py-1 text-left font-bold whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">{children}</td>,
};

export default function CopilotPanel({ onClose, projectId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Stop any in-flight speech and mic capture when the panel closes/unmounts.
  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
  }, []);

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setError('');
    setInput('');

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const history = nextMessages.slice(-MAX_HISTORY_SENT - 1, -1);
      const res = await copilotAPI.sendMessage({ message: text, history, project_id: projectId });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      if (voiceOut && speechSynthesisSupported) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(stripMarkdownForSpeech(res.data.reply));
        utter.lang = 'en-IN';
        utter.rate = 1;
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error
        || (status === 503 ? 'AI Copilot is not configured. Contact IT.'
        : status === 403 ? 'You do not have access to the Copilot.'
        : 'Something went wrong reaching the Copilot.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function toggleListening() {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = true; // show words as they're heard, so a mishear is obvious before sending
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setInput(''); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      // Speech recognition can mishear names/numbers -- land the transcript
      // in the input box for the user to confirm or fix, rather than
      // auto-sending straight to the copilot on a possibly-wrong question.
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-16px)] rounded-2xl overflow-hidden z-50 flex flex-col"
        style={{
          background: '#fff',
          border: '1px solid #E8EAED',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          height: 600,
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-bold text-slate-900">Bill Tracker Copilot</span>
          </div>
          <div className="flex items-center gap-1">
            {speechSynthesisSupported && (
              <button
                onClick={() => { setVoiceOut(v => !v); window.speechSynthesis.cancel(); }}
                title={voiceOut ? 'Voice replies on — click to mute' : 'Voice replies off — click to unmute'}
                className={clsx('w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                  voiceOut ? 'text-indigo-500 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-100')}
              >
                {voiceOut ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="text-sm font-bold text-slate-700">Ask about Bill Tracker</div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                e.g. "How many bills are pending in accounts?"<br />
                "What's the AP aging for Project X?"<br />
                "Show the vendor ledger for [vendor]"
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap bg-indigo-600 text-white rounded-br-sm">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[95%] min-w-0 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed bg-slate-100 text-slate-800 rounded-bl-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] italic">
                Thinking…
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-xl px-3.5 py-2.5 text-[12px]">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {listening && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Listening…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? 'Listening…' : 'Ask about vendor bills, cash flow, aging, deductions…'}
            rows={1}
            disabled={loading || listening}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 disabled:bg-slate-100"
          />
          {SpeechRecognitionCtor && (
            <button
              onClick={toggleListening}
              disabled={loading}
              title={listening ? 'Stop listening' : 'Ask by voice'}
              className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0',
                listening ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300',
                loading && 'opacity-50 cursor-not-allowed')}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
