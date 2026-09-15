import { render } from 'preact';
import { App } from './app';
import { preferredLocaleRedirect } from './i18n/locale';
import './styles.css';

const redirect = preferredLocaleRedirect();

if (redirect) {
  location.replace(redirect);
} else {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app mount point');
  render(<App />, root);
}
