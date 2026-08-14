import React from 'react';
import { Z_LABEL } from '../../constants/zohoStyles';

export default function FormField({ label, children, className }) {
  return (
    <div className={`space-y-1 ${className || ''}`}>
      <label className={Z_LABEL}>{label}</label>
      {children}
    </div>
  );
}
