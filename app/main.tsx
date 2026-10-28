import React from 'react';
import ReactDOM from 'react-dom/client';
import Nacre from '@/components/Nacre';
import './globals.css';
// Initialize client-side backend for GitHub Pages
import '@/lib/local-backend';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Nacre />
  </React.StrictMode>
);
