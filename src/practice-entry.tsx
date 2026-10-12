import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayerApp } from './pages/PlayerApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><PlayerApp practice /></StrictMode>
);
