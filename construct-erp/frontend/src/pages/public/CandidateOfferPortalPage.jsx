// src/pages/public/CandidateOfferPortalPage.jsx
// Public, unauthenticated candidate offer response page — mirrors
// pages/procurement/VendorRFQPortalPage.jsx's pattern exactly (token in URL,
// no Layout, no auth header required). Registered outside <ProtectedRoute>.
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, MessageSquare, FileSignature } from 'lucide-react';
import { hrOffersAPI } from '../../api/client';

const B = { navy: '#0A1F5C', blue: '#2563EB', success: '#10B981', danger: '#EF4444', bg: '#F8FAFC' };

export default function CandidateOfferPortalPage() {
  const { token } = useParams();
  const [comments, setComments] = useState('');
  const [responded, setResponded] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['candidate-offer', token],
    queryFn: () => hrOffersAPI.candidatePortal(token).then(r => r.data.data),
    retry: false,
  });

  const respondMut = useMutation({
    mutationFn: (action) => hrOffersAPI.candidatePortalRespond(token, { action, comments }),
    onSuccess: (r) => { setResponded(r.data.data.status); toast.success('Response submitted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit response'),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center" style={{ background: B.bg }}><p className="text-gray-400">Loading offer...</p></div>;
  if (error || !data) {
    const status = error?.response?.status;
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: B.bg }}>
        <div className="bg-white rounded-2xl p-8 max-w-md text-center border border-gray-100">
          <h1 className="text-lg font-black text-gray-900 mb-2">{status === 410 ? 'Link Expired' : 'Offer Not Found'}</h1>
          <p className="text-sm text-gray-500">{status === 410 ? 'This offer link has expired. Please contact HR for a new one.' : 'This link is invalid or the offer is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const alreadyResponded = data.acceptance_status !== 'pending' || responded;
  const finalStatus = responded || data.acceptance_status;

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: B.bg }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileSignature className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div>
            <h1 className="text-lg font-black text-gray-900">{data.company_name}</h1>
            <p className="text-xs text-gray-400">Offer of Employment</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-4">
          <p className="text-sm font-bold text-gray-800 mb-1">Dear {data.candidate_name},</p>
          <div className="text-sm text-gray-700 mt-4" dangerouslySetInnerHTML={{ __html: data.content_html }} />
        </div>

        {alreadyResponded ? (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
            {finalStatus === 'accepted' && <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: B.success }} />}
            {finalStatus === 'declined' && <XCircle className="w-10 h-10 mx-auto mb-2" style={{ color: B.danger }} />}
            <p className="text-sm font-bold text-gray-800">
              {finalStatus === 'accepted' ? "Thank you — you've accepted this offer." : finalStatus === 'declined' ? "You've declined this offer." : 'Your response has been recorded.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">Your Response</p>
            <textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Comments (optional)" rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-4 focus:outline-none" />
            <div className="flex flex-wrap gap-2">
              <button disabled={respondMut.isPending} onClick={() => respondMut.mutate('accept')}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: B.success }}>
                <CheckCircle2 className="w-4 h-4" /> Accept Offer
              </button>
              <button disabled={respondMut.isPending} onClick={() => respondMut.mutate('decline')}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: B.danger }}>
                <XCircle className="w-4 h-4" /> Decline Offer
              </button>
              <button disabled={respondMut.isPending || !comments} onClick={() => respondMut.mutate('request_changes')}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center gap-2 disabled:opacity-50">
                <MessageSquare className="w-4 h-4" /> Request Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
