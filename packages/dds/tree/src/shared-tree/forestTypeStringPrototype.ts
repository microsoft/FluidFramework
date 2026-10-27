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
 * Opt-in string-piece storage experiment. Not a supported package export.
 * Eligible string leaves use pieces; other content uses the optimized forest's existing chunks.
 */
export const ForestTypeStringPrototype = toForestType(
	(breaker, schema, idCompressor, shouldEncodeIncrementally) =>
		buildChunkedForest(
			makeTreeChunker(schema, defaultSchemaPolicy, shouldEncodeIncrementally, true),
			undefined,
			idCompressor,
			breaker,
		),
);
