import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scAPI } from '../../api/client';
import { FolderOpen, FileText, RefreshCw, Search } from 'lucide-react';
import { dmsAPI } from '../../api/client';

export default function SCDocuments() {
  const [search, setSearch] = useState('');
  const { data:docs=[], isLoading, refetch } = useQuery({
    queryKey:['sc-dms-docs'],
    queryFn:()=>dmsAPI.list({module:'qaqc'}).then(r=>r.data?.data||[]),
    staleTime:0,
  });
  const { data:subs=[] } = useQuery({ queryKey:['sc-list-all'], queryFn:()=>scAPI.listSC().then(r=>r.data?.data||[]), staleTime:0 });

  const getExt = n=>(n||'').split('.').pop().toLowerCase();
  const filtered = docs.filter(d=>!search||[d.doc_title,d.file_name,d.doc_type].some(v=>v?.toLowerCase().includes(search.toLowerCase())));

  const token = localStorage.getItem('accessToken')||sessionStorage.getItem('accessToken');
  const handleOpen = (doc)=>{
    const ext = getExt(doc.file_name);
    if(['pdf','png','jpg','jpeg'].includes(ext)){
      window.open(`/api/v1/dms/${doc.id}/file?token=${token}`, '_blank');
    } else {
      // Download
      const a=document.createElement('a'); a.href=`/api/v1/dms/${doc.id}/file?token=${token}`; a.download=doc.file_name; a.click();
    }
  };

  const DOC_TYPE_COLOR = { method_statement:'bg-emerald-100 text-emerald-700', inspection_report:'bg-blue-100 text-blue-700', quality_plan:'bg-purple-100 text-purple-700', certificate:'bg-amber-100 text-amber-700', general:'bg-slate-100 text-slate-600', correspondence:'bg-indigo-100 text-indigo-700' };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2"><FolderOpen className="w-6 h-6 text-indigo-600" />Subcontractor Documents</h1>
          <p className="text-sm text-slate-500 mt-0.5">Method statements, ITPs, certificates and correspondence</p>
        </div>
        <button onClick={()=>refetch()} className="p-2 border border-slate-200 bg-white rounded-xl hover:bg-slate-50"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…"
          className="pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-sm w-full focus:outline-none" />
      </div>

      {isLoading?(<div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mr-2" />Loading…</div>):(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length===0?(<div className="col-span-3 py-12 text-center"><FolderOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No documents found</p></div>)
            :filtered.map(d=>{
              const ext=getExt(d.file_name);
              const extColor={'pdf':'text-red-500','xlsx':'text-emerald-500','xls':'text-emerald-500','docx':'text-blue-500','doc':'text-blue-500'}[ext]||'text-slate-400';
              return (
                <div key={d.id} onClick={()=>handleOpen(d)}
                  className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 ${extColor}`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700">{d.doc_title||d.file_name}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{d.file_name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${DOC_TYPE_COLOR[d.doc_type]||'bg-slate-100 text-slate-500'}`}>{d.doc_type?.replace(/_/g,' ')}</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{ext}</span>
                        {d.status==='approved'&&<span className="text-[10px] font-semibold text-emerald-600">✓ Approved</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
