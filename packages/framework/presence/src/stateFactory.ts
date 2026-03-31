/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// These "unused" imports are specified to workaround an api-extractor limitation.
// @ts-expect-error -- Unused import is for type only
import type {
	// eslint-disable-next-line unused-imports/no-unused-imports
	LatestMap,
} from "./latestMapTypes.js";
import { latestMap } from "./latestMapValueManager.js";
// @ts-expect-error -- Unused import is for type only
import type {
	// eslint-disable-next-line unused-imports/no-unused-imports
	Latest,
} from "./latestTypes.js";
import { latest } from "./latestValueManager.js";

/**
 * Factory for creating presence State objects.
 *
 * @remarks
 * Use `latest` to create a {@link LatestRaw} State object.
 * Use `latestMap` to create a {@link LatestMapRaw} State object.
 *
 * @beta
 */
export const StateFactory = {
	latest,
	latestMap,
} as const;
