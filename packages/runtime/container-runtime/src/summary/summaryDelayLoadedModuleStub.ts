/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 */

/* eslint-disable @typescript-eslint/no-extraneous-class -- Stub classes */

// Stub for Fluid container-runtime's delay-loaded summarizer module
// (`./summary/summaryDelayLoadedModule/index.js`, the "summarizerDelayLoadedModule" chunk).
//
// This stub is for clients that do not use the summarizer (for example, when summarization
// happens server-side). The summarizer is a large graph of modules that is not needed in the single-file
// bundle for such clients. The stub is used in the single-file bundle instead of the real summarizer
// module, which is replaced via NormalModuleReplacementPlugin in the webpack config.
//
// The stub re-exports all symbols that the real summarizer module exports, but all of them throw
// an error when instantiated. This ensures that if any code path reaches this stub, it fails fast
// and clearly indicates that the summarizer is unavailable in this client.
//
// Example Webpack rule implementing the replacement after summaryDelayLoadedModuleStub.ts is copied
// into the src/polyfills/ directory of the application:
// ```ts
// new webpack.NormalModuleReplacementPlugin(
//     /summaryDelayLoadedModule[\\/]index\.js$/,
//     path.resolve(__dirname, "src/polyfills/summaryDelayLoadedModuleStub.ts"),
// ),
// ```
const unavailable = (name: string): never => {
	throw new Error(
		`${name} is unavailable: the summaryDelayLoadedModule chunk was stubbed out of the bundle.`,
	);
};

export class Summarizer {
	public constructor() {
		unavailable("Summarizer");
	}
}

export class RunWhileConnectedCoordinator {
	public constructor() {
		unavailable("RunWhileConnectedCoordinator");
	}
}

export class RunningSummarizer {
	public constructor() {
		unavailable("RunningSummarizer");
	}
}

export class SummarizeHeuristicData {
	public constructor() {
		unavailable("SummarizeHeuristicData");
	}
}

export class SummarizeHeuristicRunner {
	public constructor() {
		unavailable("SummarizeHeuristicRunner");
	}
}

export const defaultMaxAttempts = 2;
export const defaultMaxAttemptsForSubmitFailures = 5;
export const neverCancelledSummaryToken = Object.freeze({
	cancelled: false as const,
	waitCancelled: new Promise<never>(() => {}),
});
