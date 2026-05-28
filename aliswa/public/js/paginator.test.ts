// Register happy-dom BEFORE bun:test so the helpers can operate on real DOM
// elements in the unit tests. Scoped to this file so storage/drust tests still
// see Bun's native fetch.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { test, expect } from 'bun:test';
