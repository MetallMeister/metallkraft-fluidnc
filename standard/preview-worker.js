import { parseToolpath } from '../src/toolpath.js';
import { previewLimits } from './preview-limits.mjs';
import { createTraversalIndex } from './path-traversal.mjs';

self.onmessage = ({ data }) => {
  if (typeof data !== 'string' || data.length > previewLimits.maxBytes) {
    self.postMessage({ issue: 'ファイルは20 MB以下にしてください。' });
    return;
  }
  try {
    const result = parseToolpath(data, { ...previewLimits, packed: true,
      onProgress: value => self.postMessage({ type: 'progress', value }),
    });
    if (result.positions) result.traversalBounds = createTraversalIndex(result);
    const transfer = result.positions ? [result.positions.buffer, result.rapids.buffer, result.traversalBounds.buffer] : [];
    self.postMessage(result, transfer);
  } catch {
    self.postMessage({ issue: '解析に必要なメモリを確保できません。' });
  }
};
