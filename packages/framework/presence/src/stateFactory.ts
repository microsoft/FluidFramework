/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { latestMap } from "./latestMapValueManager.js";
import { latest } from "./latestValueManager.js";

/**
 * Factory for creating presence State objects.
 *
 * @beta
 */
export const StateFactory = {
	/**
	 * Factory for creating a {@link Latest} or {@link LatestRaw} State object.
	 */
	latest,

	/**
	 * Factory for creating a {@link LatestMap} or {@link LatestMapRaw} State object.
	 */
	latestMap,
};
