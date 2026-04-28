/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Runs after global-jsdom/register, so `window` is the jsdom window.

// Stub out canvas context so canvas-using components don't throw during tests.
// eslint-disable-next-line @typescript-eslint/no-empty-function
HTMLCanvasElement.prototype.getContext = () => null;

// FluentUI uses `targetWindow.ResizeObserver` (the jsdom window); Recharts uses
// the bare global.  Stub both so all consumers see a valid constructor.
const MockResizeObserver = class {
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	observe() {}
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	unobserve() {}
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	disconnect() {}
};
window.ResizeObserver = MockResizeObserver;
global.ResizeObserver = MockResizeObserver;
