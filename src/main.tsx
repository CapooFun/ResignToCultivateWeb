import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { validateContent } from './game/content';
import { gameStore } from './game/store';

const contentErrors = validateContent();
if (contentErrors.length > 0) throw new Error(`内容表校验失败：${contentErrors.join('；')}`);

await gameStore.initialize();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);

