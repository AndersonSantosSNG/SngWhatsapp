import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
Element.prototype.scrollIntoView = vi.fn();
globalThis.fetch = vi.fn(async () => ({ ok: false, status: 204, headers: { get: () => '' }, json: async () => null, blob: async () => null }));
