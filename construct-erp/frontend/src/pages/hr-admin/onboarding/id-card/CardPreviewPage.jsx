// src/pages/hr-admin/onboarding/id-card/CardPreviewPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, ArrowLeft, Search, ZoomIn, ZoomOut, RotateCw, Download, RefreshCw } from 'lucide-react';
import { hrIdCardAPI, companySettingsAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';
import IdCardFace from '../../../../components/hr/id-card/IdCardFace';
import { downloadSingleCardPdf } from '../../../../components/hr/id-card/idCardPdf';

export default function CardPreviewPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cardId, setCardId] = useState(null);
  const [side, setSide] = useState('front');
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);

  const { data: cards } = useQuery({ queryKey: ['idcard-cards', search], queryFn: () => hrIdCardAPI.cards({ search: search || undefined }).then(r => r.data.data) });
  const { data: card } = useQuery({ queryKey: ['idcard-card', cardId], queryFn: () => hrIdCardAPI.card(cardId).then(r => r.data.data), enabled: !!cardId });
  const { data: company } = useQuery({ queryKey: ['company-settings'], queryFn: () => companySettingsAPI.get().then(r => r.data.data) });

  const employee = card ? { ...card.employee, qr_code_data: card.qr_code_data } : null;

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Eye className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Card Preview</h1><p className="text-xs text-gray-400">Live preview with zoom, rotate and front/back view</p></div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search generated cards..."
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {(cards || []).map(c => (
              <button key={c.id} onClick={() => setCardId(c.id)} className={`w-full text-left p-2.5 rounded-lg ${cardId === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <p className="text-sm font-bold text-gray-800">{c.employee_name}</p>
                <p className="text-xs text-gray-400">{c.card_number} · {c.employee_code}</p>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div {...fade(0.08)} className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 flex flex-col items-center" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          {!employee ? (
            <p className="text-sm text-gray-400 py-20">Select a card to preview.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setSide('front')} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={side === 'front' ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>Front</button>
                <button onClick={() => setSide('back')} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={side === 'back' ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>Back</button>
                <button onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}><ZoomOut className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.2))}><ZoomIn className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => setRotate(r => r + 90)}><RotateCw className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: 'transform 0.2s' }} className="my-8">
                <IdCardFace side={side} employee={{ ...employee, issue_date: card.issue_date, expiry_date: card.expiry_date }} company={company} qrDataUri={employee.qr_code_data} theme={card.theme || 'blue'} />
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => downloadSingleCardPdf(employee, company)} className="text-xs font-bold px-4 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ background: B.blue }}>
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
