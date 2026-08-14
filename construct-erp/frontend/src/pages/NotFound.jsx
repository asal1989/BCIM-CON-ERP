import React from 'react';
import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <div className="text-6xl mb-4">🏗</div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">Page Not Found</h1>
      <p className="text-sm text-slate-500 mb-6">This page doesn't exist yet or is under construction.</p>
      <Link to="/dashboard" className="btn-primary">← Back to Dashboard</Link>
    </div>
  );
}
