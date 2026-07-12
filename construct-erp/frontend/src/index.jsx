import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// PWA service worker registration + auto-update lives in index.html (single
// source of truth, including the controllerchange auto-reload). Registering
// again here would be redundant — the inline script handles it before this
// bundle even parses.
