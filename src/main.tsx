import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { toast } from './components/ui';
import { AuthProvider } from './data/auth';
import { onCloudWriteError } from './data/cloud';
import './styles.css';

// Ask the browser not to evict our IndexedDB data under storage pressure.
void navigator.storage?.persist?.();

onCloudWriteError((e) => {
  console.error(e);
  const code = (e as { code?: string }).code;
  toast(
    code === 'permission-denied'
      ? "Not saved to the club database — you're not on the scorer list"
      : `Sync error: ${(e as Error).message}`,
  );
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
