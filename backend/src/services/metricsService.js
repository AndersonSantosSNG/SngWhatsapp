const counters = new Map();
const gauges = new Map();

function increment(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function gauge(name, value) {
  gauges.set(name, Number(value) || 0);
}

function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
    },
  };
}

module.exports = { increment, gauge, snapshot };
