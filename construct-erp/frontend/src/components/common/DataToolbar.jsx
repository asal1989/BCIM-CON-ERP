import React from 'react';
import { Download, Upload, Plus } from 'lucide-react';
import { exportToCSV } from '../../utils/exportUtils';
import toast from 'react-hot-toast';

export default function DataToolbar({ 
  onAdd, 
  data, 
  fileName = 'export', 
  addLabel = 'Add New',
  hideAdd = false,
  onImport,
  templateData,
  templateName = 'template'
}) {
  const handleExport = () => {
    if (!data || !data.length) {
      toast.error('No data available to export');
      return;
    }
    exportToCSV(data, fileName);
    toast.success('Export downloaded successfully');
  };

  const handleDownloadTemplate = () => {
    if (!templateData || !templateData.length) {
      toast.error('No template available');
      return;
    }
    exportToCSV(templateData, templateName);
    toast.success('Template downloaded. Please fill and import.');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onImport) {
      onImport(file);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {templateData && (
        <button onClick={handleDownloadTemplate} className="btn-secondary !text-teal-400 !border-teal-400/20 hover:bg-teal-400/10 py-1.5 px-3">
          <Download size={14} className="mr-2" /> <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-widest">Template</span>
        </button>
      )}
      <div className="relative">
        <button className="btn-secondary flex items-center gap-2 border-white/10 hover:bg-white/5 py-1.5 px-3">
          <Upload size={14} /> <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-widest">Import</span>
        </button>
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          className="absolute inset-0 opacity-0 cursor-pointer" 
          disabled={!onImport}
        />
      </div>
      <button onClick={handleExport} className="btn-secondary flex items-center gap-2 border-white/10 hover:bg-white/5 py-1.5 px-3">
        <Download size={14} /> <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-widest">Export</span>
      </button>
      {!hideAdd && (
        <button onClick={onAdd} className="btn-primary flex items-center gap-2 py-1.5 px-4 shadow-lg shadow-blue-500/20">
          <Plus size={14} /> <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-widest">{addLabel}</span>
        </button>
      )}
    </div>
  );
}
