/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { latestMap } from "./latestMapValueManager.js";
import { latest } from "./latestValueManager.js";

/**
 * Factory for creating presence State objects.
 *
 * @alpha
 */
export const StateFactory = {
	/**
	 * {@inheritdoc latest}
	 */
	latest,
	/**
	 * {@inheritdoc latestMap}
	 */
	latestMap,
};
