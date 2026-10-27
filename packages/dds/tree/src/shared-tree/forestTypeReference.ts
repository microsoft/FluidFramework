/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { buildForest } from "../feature-libraries/index.js";

import { toForestType } from "./forestType.js";

/**
 * Reference implementation of forest.
 * @remarks
 * A simple implementation with minimal complexity and moderate debuggability, validation, and performance.
 *
 * This is the ObjectForest forest type.
 * @beta
 */
export const ForestTypeReference = toForestType((breaker, schema) =>
	buildForest(breaker, schema),
);
