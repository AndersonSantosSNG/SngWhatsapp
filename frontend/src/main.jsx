import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DocsPage from './components/DocsPage';
import './styles.css';

const preventBrowserContextMenu = (event) => event.preventDefault();
const preventBrowserZoomShortcut = (event) => {
  const zoomKeys = ['+', '-', '=', '_', '0'];
  const zoomCodes = ['NumpadAdd', 'NumpadSubtract'];

  if (
    (event.ctrlKey || event.metaKey) &&
    (zoomKeys.includes(event.key) || zoomCodes.includes(event.code))
  ) {
    event.preventDefault();
  }
};
const preventBrowserZoomGesture = (event) => {
  if (event.ctrlKey) event.preventDefault();
};

document.addEventListener('contextmenu', preventBrowserContextMenu);
document.addEventListener('keydown', preventBrowserZoomShortcut);
document.addEventListener('wheel', preventBrowserZoomGesture, { passive: false });
document.addEventListener('gesturestart', preventBrowserContextMenu, { passive: false });
document.addEventListener('gesturechange', preventBrowserContextMenu, { passive: false });

const RootPage =
  window.location.pathname === '/docs' || window.location.pathname.startsWith('/docs/')
    ? DocsPage
    : App;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);
