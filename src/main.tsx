import React from 'react';
import { createRoot } from 'react-dom/client';
import AppV3 from './AppV3';
import './stylesV4.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <React.StrictMode>
    <AppV3 />
  </React.StrictMode>
);
