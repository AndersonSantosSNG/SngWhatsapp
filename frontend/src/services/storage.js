const memory = new Map();

export const storage = {
  get(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return memory.get(key) ?? fallback; }
  },
  set(key, value) {
    memory.set(key, String(value));
    try { localStorage.setItem(key, String(value)); } catch {}
  },
  remove(key) {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch {}
  }
};
