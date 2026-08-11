// src/components/common/SignaturePadModal.jsx
import React, { useRef, useEffect } from 'react';
import { X, Trash2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

export default function SignaturePadModal({ title, subtitle, onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    // scale for canvas resolution vs display size
    const scaleX = canvasRef.current.width  / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  };

  const startDraw = (e) => { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e); };
  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };
  const endDraw = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const data   = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasSign = Array.from(data).some((v, i) => i % 4 !== 3 && v < 230);
    if (!hasSign) return toast.error('Please draw your signature first');
    onSave(canvas.toDataURL('image/png'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-black">✍ Digital Signature</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-slate-400 mb-2 text-center">Draw your signature below</p>
          <div className="border-2 border-dashed border-indigo-200 rounded-xl overflow-hidden bg-white cursor-crosshair select-none">
            <canvas
              ref={canvasRef}
              width={460}
              height={170}
              style={{ display: 'block', width: '100%', height: '170px', touchAction: 'none' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="flex items-center justify-between mt-2 mb-1">
            <p className="text-[10px] text-slate-400 italic">Use mouse or touch to sign</p>
            <button onClick={clear} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        {/* Info strip */}
        <div className="mx-5 mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
          <p className="text-[11px] text-indigo-600">
            <span className="font-semibold">{title}</span>
            &nbsp;·&nbsp;{dayjs().format('DD MMM YYYY, HH:mm')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" /> Confirm & Sign
          </button>
        </div>
      </div>
    </div>
  );
}
