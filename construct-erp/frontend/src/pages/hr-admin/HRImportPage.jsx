// src/pages/hr-admin/HRImportPage.jsx — 2026 Premium UI
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Users, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react';
import { hrImportAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430', success:'#10B981' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth()+1;
const years = Array.from({length:5},(_,i)=>currentYear-i);

const TABS = [
  { id:'employees',  label:'Staff / Employees', icon:Users },
  { id:'attendance', label:'Attendance',         icon:Clock },
];

const EMPLOYEE_SAMPLE = `Employee Code,Employee Name,Email,Mobile,Department,Designation,Date of Joining,Date of Birth,Gender,PAN,UAN,Bank Account No,IFSC Code,Bank Name,Employment Type,Employee Category,Status,CTC\nBCIM-0001,Ravi Kumar,ravi@company.com,9876543210,Engineering,Site Engineer,01-04-2023,15-06-1990,male,ABCDE1234F,100234567890,123456789012,SBIN0001234,SBI,permanent,BCIM Staff,active,600000\n18001,Suresh M,,9876543211,Civil,Mason,01-01-2022,10-03-1985,male,XYZAB5678G,100234567891,234567890123,HDFC0001234,HDFC,permanent,BCIM Workers,active,`;
const ATTENDANCE_WIDE_SAMPLE = `Employee Code,Employee Name,01,02,03,04,05,06,07,08,09,10\nEMP001,Ravi Kumar,P,P,P,P,P,WO,WO,P,P,P\nEMP002,Priya Sharma,P,P,A,P,P,WO,WO,P,P,P`;

function downloadSample(content, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content],{type:'text/csv'}));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

function FileDropzone({ onFile, file }) {
  const onDrop = useCallback(accepted=>{ if(accepted[0]) onFile(accepted[0]); },[onFile]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    maxFiles: 1,
  });
  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
      isDragActive?'border-blue-400 bg-blue-50':'border-gray-200 hover:border-blue-300 bg-gray-50 hover:bg-blue-50'
    }`}>
      <input {...getInputProps()}/>
      <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive?'text-blue-500':'text-gray-400'}`}/>
      {file ? (
        <div>
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold">
            <FileText className="w-4 h-4"/> {file.name}
          </div>
          <p className="text-gray-400 text-sm mt-1">{(file.size/1024).toFixed(1)} KB · Click or drag to replace</p>
        </div>
      ) : (
        <div>
          <p className="text-gray-700 font-bold">Drop your Excel or CSV file here</p>
          <p className="text-gray-400 text-sm mt-1">or click to browse — .xlsx and .csv supported, max 10 MB</p>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ data }) {
  if (!data) return null;
  const cols  = data.columns.slice(0,8);
  const extra = data.columns.length-8;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-gray-900 font-bold text-sm">Preview — {data.total} rows detected</span>
        {extra>0 && <span className="text-gray-400 text-xs">+{extra} more columns not shown</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {cols.map(c=><th key={c} className="px-3 py-2 text-left text-gray-500 font-black uppercase tracking-wide whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.preview.map((row,i)=>(
              <tr key={i} className="hover:bg-gray-50">
                {cols.map(c=><td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">{row[c]||'—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultSummary({ result }) {
  const [showErrors, setShowErrors] = useState(false);
  if (!result) return null;
  const stats = [
    result.created  !==undefined && { label:'Created',  value:result.created,           bg:'bg-emerald-50', text:'text-emerald-700' },
    result.inserted !==undefined && { label:'Inserted',  value:result.inserted,          bg:'bg-emerald-50', text:'text-emerald-700' },
    result.updated  !==undefined && { label:'Updated',   value:result.updated,           bg:'bg-blue-50',    text:'text-blue-700'    },
    result.skipped  !==undefined && { label:'Skipped',   value:result.skipped,           bg:'bg-amber-50',   text:'text-amber-700'   },
    {                                 label:'Errors',    value:result.errors?.length||0,  bg:'bg-red-50',     text:'text-red-700'     },
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(c=>(
          <div key={c.label} className={`rounded-2xl p-4 text-center border ${c.bg} border-opacity-50`}>
            <div className={`text-2xl font-black ${c.text}`}>{c.value}</div>
            <div className={`text-xs font-bold mt-1 ${c.text} opacity-70 uppercase tracking-wide`}>{c.label}</div>
          </div>
        ))}
      </div>
      {result.format && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
          Detected format: <span className="font-black text-gray-900">{result.format}</span>
        </div>
      )}
      {result.errors?.length>0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
          <button onClick={()=>setShowErrors(v=>!v)}
            className="w-full px-4 py-3 flex items-center justify-between text-red-700 text-sm font-bold hover:bg-red-100 transition-colors">
            <span className="flex items-center gap-2"><XCircle className="w-4 h-4"/> {result.errors.length} row error(s)</span>
            {showErrors ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>
          {showErrors && (
            <div className="border-t border-red-200 max-h-48 overflow-y-auto divide-y divide-red-100">
              {result.errors.map((e,i)=>(
                <div key={i} className="px-4 py-2 text-xs text-red-700">
                  <span className="font-black">Row {e.row}:</span> {e.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeImportTab() {
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [result,  setResult]  = useState(null);
  const [mode,    setMode]    = useState('create');
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState('upload');

  const handlePreview = async () => {
    if(!file) return;
    setLoading(true);
    try { const r = await hrImportAPI.previewEmployees(file); setPreview(r.data); setStep('preview'); }
    catch(e) { toast.error(e.response?.data?.error||'Failed to parse CSV'); }
    finally { setLoading(false); }
  };
  const handleImport = async () => {
    if(!file) return;
    setLoading(true);
    try {
      const r = await hrImportAPI.importEmployees(file,mode);
      setResult(r.data); setStep('done');
      const { created=0, updated=0 } = r.data;
      toast.success(`Import done — ${created} created, ${updated} updated`);
    } catch(e) { toast.error(e.response?.data?.error||'Import failed'); }
    finally { setLoading(false); }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setStep('upload'); };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-black text-blue-900">How to import employees:</p>
        <p>1. Upload your Excel (.xlsx) or CSV file below — standard column names are auto-mapped.</p>
        <p>2. A <strong>Project</strong> column (last column) assigns each employee to their site/project location.</p>
        <p>3. <strong>Create mode</strong> → new employees created; default login password = employee code.</p>
        <p>4. <strong>Update mode</strong> → only updates profiles for employees already in the system.</p>
      </div>

      <button onClick={()=>downloadSample(EMPLOYEE_SAMPLE,'employee-sample.csv')}
        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors">
        <Download className="w-3.5 h-3.5"/> Download sample CSV format
      </button>

      <FileDropzone file={file} onFile={f=>{ setFile(f); setPreview(null); setResult(null); setStep('upload'); }}/>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-gray-600 text-sm font-bold">Import mode:</span>
        {[
          ['create_only', 'Create new only (skip duplicates)'],
          ['create',      'Create new + update existing'],
          ['update',      'Update existing only'],
        ].map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="emp-mode" value={v} checked={mode===v} onChange={()=>setMode(v)} className="accent-blue-600"/>
            <span className="text-sm text-gray-700 font-medium">{label}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        {step==='upload' && (
          <button onClick={handlePreview} disabled={!file||loading}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-bold flex items-center gap-2">
            {loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<FileText className="w-4 h-4"/>} Preview File
          </button>
        )}
        {step==='preview' && <>
          <button onClick={handleImport} disabled={loading}
            className="px-5 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-40 flex items-center gap-2"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            {loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<Upload className="w-4 h-4"/>}
            Import {preview?.total} Employees
          </button>
          <button onClick={reset} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold">Cancel</button>
        </>}
        {step==='done' && (
          <button onClick={reset}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4"/> Import Another File
          </button>
        )}
      </div>

      {step==='preview' && preview && <PreviewTable data={preview}/>}
      {step==='done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-black"><CheckCircle className="w-5 h-5"/> Import Complete</div>
          <ResultSummary result={result}/>
          {result.debug && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono text-gray-700 space-y-1">
              <div className="font-bold text-gray-900">Debug (row 1 parsed on server):</div>
              <div>Code: <span className="text-blue-700 font-bold">{result.debug.empCode || '(empty)'}</span></div>
              <div>Name: <span className="text-blue-700 font-bold">{result.debug.name || '(empty)'}</span></div>
              <div>Dept: <span className="text-blue-700 font-bold">{result.debug.dept || '(empty)'}</span></div>
              <div className="text-gray-400">Keys: {result.debug.keys?.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttendanceImportTab() {
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [result,  setResult]  = useState(null);
  const [month,   setMonth]   = useState(currentMonth);
  const [year,    setYear]    = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState('upload');

  const handlePreview = async () => {
    if(!file) return;
    setLoading(true);
    try { const r = await hrImportAPI.previewAttendance(file); setPreview(r.data); setStep('preview'); }
    catch(e) { toast.error(e.response?.data?.error||'Failed to parse CSV'); }
    finally { setLoading(false); }
  };
  const handleImport = async () => {
    if(!file) return;
    setLoading(true);
    try {
      const r = await hrImportAPI.importAttendance(file,month,year);
      setResult(r.data); setStep('done');
      const { inserted=0, updated=0 } = r.data;
      toast.success(`Import done — ${inserted} inserted, ${updated} updated`);
    } catch(e) { toast.error(e.response?.data?.error||'Import failed'); }
    finally { setLoading(false); }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setStep('upload'); };
  const isWide = preview?.columns?.some(c=>/^(0?[1-9]|[12]\d|3[01])$/.test(c.trim()));

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-black text-blue-900">How to prepare the attendance CSV:</p>
        <p>1. Export monthly attendance from your HR system → Monthly Attendance Summary → Export CSV</p>
        <p>2. We support both formats: <strong>Wide</strong> (one row/employee, columns=days) &amp; <strong>Long</strong> (one row per date)</p>
        <p>3. Status codes: P=Present, A=Absent, H=Half Day, WO=Week Off, L/PL/CL/SL=Leave, HO=Holiday</p>
      </div>

      <button onClick={()=>downloadSample(ATTENDANCE_WIDE_SAMPLE,'attendance-sample.csv')}
        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors">
        <Download className="w-3.5 h-3.5"/> Download sample CSV format (wide)
      </button>

      <FileDropzone file={file} onFile={f=>{ setFile(f); setPreview(null); setResult(null); setStep('upload'); }}/>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-gray-600 text-sm font-bold">Attendance month:</span>
        <select value={month} onChange={e=>setMonth(+e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
          {months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(+e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-gray-400 text-xs">(used for wide/grid format only)</span>
      </div>

      <div className="flex gap-3">
        {step==='upload' && (
          <button onClick={handlePreview} disabled={!file||loading}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-xl text-sm font-bold flex items-center gap-2">
            {loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<FileText className="w-4 h-4"/>} Preview File
          </button>
        )}
        {step==='preview' && <>
          <button onClick={handleImport} disabled={loading}
            className="px-5 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-40 flex items-center gap-2"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            {loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<Upload className="w-4 h-4"/>}
            Import {preview?.total} Rows
          </button>
          <button onClick={reset} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold">Cancel</button>
        </>}
        {step==='done' && (
          <button onClick={reset}
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4"/> Import Another File
          </button>
        )}
      </div>

      {step==='preview' && preview && (
        <div className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-bold ${
          isWide?'bg-violet-50 text-violet-700 border border-violet-200':'bg-teal-50 text-teal-700 border border-teal-200'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5"/>
          Detected: {isWide?'Wide format (monthly grid)':'Long format (daily rows)'}
        </div>
      )}

      {step==='preview' && preview && <PreviewTable data={preview}/>}
      {step==='done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-black"><CheckCircle className="w-5 h-5"/> Import Complete</div>
          <ResultSummary result={result}/>
        </div>
      )}
    </div>
  );
}

export default function HRImportPage() {
  const [activeTab, setActiveTab] = useState('employees');

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Upload className="w-5 h-5 text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Import HR Data</h1>
            <p className="text-white/55 text-sm mt-0.5">Upload CSV files to sync employees &amp; attendance records</p>
          </div>
        </div>
      </motion.div>

      {/* Tab Bar */}
      <motion.div {...fade(0.08)} className="flex gap-1 bg-white rounded-2xl p-1.5 border border-gray-100 w-fit"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab===t.id?'bg-blue-600 text-white shadow-sm':'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}>
            <t.icon className="w-4 h-4"/> {t.label}
          </button>
        ))}
      </motion.div>

      {/* Tab Content */}
      <motion.div {...fade(0.12)} className="bg-white rounded-2xl border border-gray-100 p-6"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        {activeTab==='employees'  && <EmployeeImportTab/>}
        {activeTab==='attendance' && <AttendanceImportTab/>}
      </motion.div>
    </div>
  );
}
