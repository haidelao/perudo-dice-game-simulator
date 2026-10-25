import { decide } from './ai.js';
self.onmessage = ({ data }) => {
  try {
    const result = decide(data.observation, data.profiles, data.seed);
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error.message ?? error) });
  }
};
