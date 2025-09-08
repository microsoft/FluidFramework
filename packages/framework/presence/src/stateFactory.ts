/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { latestMap } from "./latestMapValueManager.js";
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
};
