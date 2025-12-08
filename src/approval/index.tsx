/**
 * AINTIVIRUS dApp Connectivity - Approval Window Entry Point
 * 
 * This is the entry point for the approval window that opens when
 * a dApp requests user approval for connect, sign, or transaction.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/global.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
