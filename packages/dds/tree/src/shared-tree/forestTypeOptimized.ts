/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	buildChunkedForest,
	defaultSchemaPolicy,
	makeTreeChunker,
} from "../feature-libraries/index.js";

import { toForestType } from "./forestType.js";

/**
 * Optimized implementation of forest.
 * @remarks
 * A complex optimized forest implementation with minimal validation and debuggability.
 * It uses an internal representation that is optimized for size and larger data sets.
 * @beta
 */
export const ForestTypeOptimized = toForestType(
	(breaker, schema, idCompressor, shouldEncodeIncrementally) =>
		buildChunkedForest(
			makeTreeChunker(schema, defaultSchemaPolicy, shouldEncodeIncrementally),
			undefined,
			idCompressor,
			breaker,
		),
);
