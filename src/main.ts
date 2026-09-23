import './styles.css';
import { mountFire } from './view';

if (import.meta.env.DEV && location.hash.includes('figmacapture=')) {
  const capture = document.createElement('script');
  capture.src = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
  capture.async = true;
  document.head.append(capture);
}

const root = document.getElementById('fire-root');
if (!root) throw new Error('FIRE 계산기 화면을 찾지 못했습니다.');
mountFire(root);
