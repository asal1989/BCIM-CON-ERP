import React from 'react';
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center text-2xl mb-4 mx-auto animate-pulse">🏗</div>
        <div className="text-slate-500 text-sm animate-pulse">Loading ConstructERP...</div>
        <div className="mt-3 flex items-center justify-center gap-1">
          {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{animationDelay:`${i*150}ms`}}/>)}
        </div>
      </div>
    </div>
  );
}
