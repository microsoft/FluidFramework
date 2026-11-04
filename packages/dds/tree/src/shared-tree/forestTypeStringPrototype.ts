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
 * Directly encountered eligible string leaves use pieces; existing containers are reused.
 * Repacking nested text decoded from older formats is outside this prototype.
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
