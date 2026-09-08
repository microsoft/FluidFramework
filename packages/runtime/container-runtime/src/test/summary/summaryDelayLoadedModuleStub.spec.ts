/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";

// eslint-disable-next-line import-x/no-internal-modules -- the test deliberately compares the stub against the real module that it stands in for
import type * as real from "../../summary/summaryDelayLoadedModule/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- the stub is not part of the package's public surface and is imported directly under test
import * as stub from "../../summary/summaryDelayLoadedModuleStub.js";

/*
 * Compile-time type tests (leveraging `requireAssignableTo` from the type-test infrastructure) that
 * assert the shape of `summaryDelayLoadedModuleStub` stays in sync with the real delay-loaded
 * summarizer module (`./summary/summaryDelayLoadedModule/index.js`) that it stands in for.
 *
 * The stub is swapped in for the real module (via webpack's NormalModuleReplacementPlugin) in
 * single-file bundles that do not use the summarizer. For that swap to be safe, the stub must
 * re-export exactly the same runtime (value) symbols as the real module. If the real module gains
 * or loses a runtime export and the stub is not updated to match, the assertions below fail to
 * compile, flagging that the stub needs to be updated.
 *
 * Purely type-only exports of the real module (e.g. `ISummarizeResults`) are intentionally not
 * covered here: they are erased at runtime and so do not need to be stubbed, and `keyof typeof`
 * only includes value-side exports anyway.
 */

/**
 * Every runtime export of the real module must also be exported by the stub. If this fails, the
 * stub is missing an export that the real module provides, which would break a stubbed bundle.
 */
declare type _stubExportsAllRealValueSymbols = requireAssignableTo<
	keyof typeof real,
	keyof typeof stub
>;

/**
 * The stub must not export anything the real module does not. If this fails, the stub has a stray
 * export to remove (or the real module dropped an export that the stub still references).
 */
declare type _stubExportsNothingExtra = requireAssignableTo<
	keyof typeof stub,
	keyof typeof real
>;

/*
 * The non-class (constant) exports must stay type-compatible with the real module so the stub
 * remains a valid stand-in for any code that reads these values.
 */
declare type _defaultMaxAttempts = requireAssignableTo<
	typeof stub.defaultMaxAttempts,
	typeof real.defaultMaxAttempts
>;
declare type _defaultMaxAttemptsForSubmitFailures = requireAssignableTo<
	typeof stub.defaultMaxAttemptsForSubmitFailures,
	typeof real.defaultMaxAttemptsForSubmitFailures
>;
declare type _neverCancelledSummaryToken = requireAssignableTo<
	typeof stub.neverCancelledSummaryToken,
	typeof real.neverCancelledSummaryToken
>;
