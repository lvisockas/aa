import './ui/styles.css';
import { App } from './app/app';

const root = document.getElementById('app') ?? document.body;
try {
  new App(root);
} catch (e) {
  console.error(e);
  (window as unknown as { __err: string }).__err = String(e);
  root.innerHTML = `<div class="fatal"><h3>Couldn't start the renderer</h3><p>This page needs a browser with WebGL2. ${String(e).slice(0, 300)}</p></div>`;
}
