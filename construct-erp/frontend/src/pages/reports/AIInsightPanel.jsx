// src/pages/reports/AIInsightPanel.jsx
// Real Claude-generated insights for a project, computed server-side from
// the same KPI queries the Project 360 page itself uses (see
// copilotService.buildProjectInsightKpis + generateProjectInsights).
// Degrades gracefully — hides itself rather than erroring the page — if
// ANTHROPIC_API_KEY isn't configured or the call fails.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { copilotAPI } from '../../api/client';

export default function AIInsightPanel({ projectId }) {
  const { data: insights, isLoading, isError } = useQuery({
    queryKey: ['project-insights', projectId],
    queryFn: () => copilotAPI.projectInsights(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // No key configured, request failed, or the model returned nothing usable
  // — hide the panel entirely rather than showing an error or empty shell.
  if (!isLoading && (isError || !insights?.length)) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm relative">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Cpu size={120} />
      </div>

      <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Cpu className={clsx('w-6 h-6 text-indigo-500', isLoading && 'animate-spin')} />
          </div>
          <div>
            <h3 className="text-lg font-medium text-slate-900 uppercase italic tracking-tight leading-none">AI Insights</h3>
            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-1">Generated from this project's current metrics</p>
          </div>
        </div>
      </div>

      <div className="p-8">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-10 flex flex-col items-center gap-3 text-center">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin" />
              </div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Generating insights…</p>
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((text, i) => (
                <div key={i} className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-3">
                  <Sparkles size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-700 leading-relaxed">{text}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
