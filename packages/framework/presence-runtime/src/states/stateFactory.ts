/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// These "unused" imports are specified to workaround an api-extractor limitation.
// @ts-expect-error -- Unused import is for type only
import type {
	// eslint-disable-next-line unused-imports/no-unused-imports
	Latest,
	// eslint-disable-next-line unused-imports/no-unused-imports
	LatestMap,
} from "@fluid-internal/presence-definitions";

import { latestMap } from "./latestMapValueManager.js";
import { latest } from "./latestValueManager.js";

/**
 * Factory for creating presence State objects.
 *
 * @remarks
 * Use `latest` to create a {@link @fluidframework/presence#LatestRaw} State object.
 * Use `latestMap` to create a {@link @fluidframework/presence#LatestMapRaw} State object.
 *
 * @public
 */
export const StateFactory = {
	latest,
	latestMap,
} as const;
