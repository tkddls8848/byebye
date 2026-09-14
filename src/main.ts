import './styles.css';
import { mountFire } from './view';

const root = document.getElementById('fire-root');
if (!root) throw new Error('FIRE 계산기 화면을 찾지 못했습니다.');
mountFire(root);
