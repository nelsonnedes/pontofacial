import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test-url';
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}
