import React from 'react';
export default function SimplePage({ title, icon, description, color = 'text-blue-500' }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-1">
        <span className={color} style={{ fontSize: 22 }}>{icon}</span> {title}
      </h1>
      <p className="text-sm text-slate-500 mb-6">{description}</p>
      <div className="card p-10 text-center border-dashed">
        <div style={{ fontSize: 48 }} className="mb-3">{icon}</div>
        <div className="text-sm text-slate-500">Connected to backend API</div>
        <div className="text-xs text-slate-400 mt-1">Data loads automatically when the backend is running</div>
      </div>
    </div>
  );
}
