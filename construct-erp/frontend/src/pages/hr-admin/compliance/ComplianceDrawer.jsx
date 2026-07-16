// src/pages/hr-admin/compliance/ComplianceDrawer.jsx
// Animated right-side drawer showing full compliance detail: info, legal
// requirement, applicable employees, documents, renewal timeline, history,
// owner, comments, attachments.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Download, Paperclip, Send, ShieldCheck, Scale, Users2,
  CalendarClock, MessageSquare,
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from './ComplianceStatusBadge';
import ComplianceTimeline from './ComplianceTimeline';
import { fmtDate } from './complianceData';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-slate-50/70 rounded-2xl border border-slate-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

const DUMMY_DOCS = (n) => [...Array(Math.min(n, 4))].map((_, i) => ({
  name: ['Challan_Receipt.pdf', 'Application_Form.pdf', 'Authority_Letter.pdf', 'Renewal_Acknowledgement.pdf'][i],
  size: ['248 KB', '1.2 MB', '512 KB', '190 KB'][i],
}));

export default function ComplianceDrawer({ item, onClose }) {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([
    { by: 'Nandhini R', time: '2 days ago', text: 'Renewal application drafted, awaiting director sign-off.' },
  ]);

  const timeline = item ? [
    { state: 'done',    title: 'Compliance registered',   date: fmtDate(item.lastUpdated), by: item.owner },
    { state: 'done',    title: 'Documents collected',     date: fmtDate(item.lastUpdated), note: `${item.documents} evidence files attached` },
    { state: 'current', title: `Due — ${item.status}`,    date: fmtDate(item.dueDate) },
    { state: 'next',    title: 'Next renewal',            date: fmtDate(item.renewalDate) },
  ] : [];

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] z-40" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col">

            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3"
              style={{ background: 'linear-gradient(135deg,#EFF6FF, #ffffff)' }}>
              <div>
                <p className="text-xs font-semibold text-blue-600">{item.id} · {item.type}</p>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5 leading-snug">{item.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                </div>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <Section icon={ShieldCheck} title="Compliance Information">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  {[
                    ['Category', item.category], ['Department', item.department],
                    ['Location', item.location], ['Owner', item.owner],
                    ['Due Date', fmtDate(item.dueDate)], ['Renewal Date', fmtDate(item.renewalDate)],
                    ['Last Updated', fmtDate(item.lastUpdated)], ['Documents', `${item.documents} files`],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <p className="text-[11px] text-slate-400 font-medium">{l}</p>
                      <p className="text-slate-800 font-semibold mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">{item.description}</p>
              </Section>

              <Section icon={Scale} title="Legal Requirement">
                <p className="text-sm font-semibold text-slate-800">{item.legalRef}</p>
                <p className="text-xs text-slate-500 mt-1">Non-compliance may attract penalty, interest and prosecution under the applicable Act.</p>
              </Section>

              <Section icon={Users2} title="Applicable Employees">
                <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold">
                  {item.applicableTo}
                </span>
              </Section>

              <Section icon={Paperclip} title="Documents & Attachments">
                <div className="space-y-2">
                  {DUMMY_DOCS(item.documents).map(doc => (
                    <div key={doc.name} className="flex items-center justify-between bg-white rounded-xl border border-slate-100 px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                          <p className="text-[11px] text-slate-400">{doc.size}</p>
                        </div>
                      </div>
                      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={CalendarClock} title="Renewal Timeline & History">
                <ComplianceTimeline events={timeline} />
              </Section>

              <Section icon={MessageSquare} title="Comments">
                <div className="space-y-3 mb-3">
                  {comments.map((c, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-100 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-700">{c.by} <span className="text-slate-300 font-normal">· {c.time}</span></p>
                      <p className="text-sm text-slate-600 mt-1">{c.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={comment} onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && comment.trim()) { setComments(p => [...p, { by: 'You', time: 'Just now', text: comment.trim() }]); setComment(''); } }}
                    className="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="Add a comment…" />
                  <button onClick={() => { if (comment.trim()) { setComments(p => [...p, { by: 'You', time: 'Just now', text: comment.trim() }]); setComment(''); } }}
                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0" style={{ background: '#2563EB' }}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
