/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	buildChunkedForest,
	buildForest,
	ComparisonForest,
	defaultSchemaPolicy,
	makeTreeChunker,
} from "../feature-libraries/index.js";

import { toForestType } from "./forestType.js";

/**
 * Slow forest implementation intended only for debugging.
 * @remarks
 * This implementation has validation that scales poorly.
 * It can be asymptotically slower than the reference implementation and can perform very badly with larger data sizes.
 *
 * It uses a ChunkedForest as its main forest and validates every delta against an ObjectForest.
 * @beta
 */
export const ForestTypeExpensiveDebug = toForestType(
	(breaker, schema, idCompressor, shouldEncodeIncrementally) =>
		new ComparisonForest(
			buildChunkedForest(
				makeTreeChunker(schema, defaultSchemaPolicy, shouldEncodeIncrementally),
				undefined,
				idCompressor,
				breaker,
			),
			buildForest(breaker, schema, undefined, true),
		),
);
