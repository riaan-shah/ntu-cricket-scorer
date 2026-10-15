import { useEffect, useState } from 'react';

/** Large-text, high-contrast display for scoring in bright sun. Per device, remembered across visits. */
const KEY = 'ntu-sun-mode';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function apply(on: boolean) {
  if (on) document.documentElement.dataset.sun = '1';
  else delete document.documentElement.dataset.sun;
}

/** Call once at startup so the page never flashes the normal theme first. */
export function initSunMode() {
  apply(read());
}

const listeners = new Set<(on: boolean) => void>();

export function setSunMode(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // private mode: still applies for this visit
  }
  apply(on);
  listeners.forEach((l) => l(on));
}

export function useSunMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, setSunMode];
}
