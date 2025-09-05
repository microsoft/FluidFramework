/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IntervalCollectionOracle } from "../../intervalCollectionOracle.js";
import type { ISharedString } from "../../sharedString.js";
import { SharedStringOracle } from "../../sharedStringOracle.js";

/**
 * A channel decorated with one or more oracles for validation.
 * This supports SharedString and IntervalCollection oracles.
 * @internal
 */
export interface IChannelWithOracles extends ISharedString {
	/** Oracle for validating the SharedString state */
	sharedStringOracle: SharedStringOracle;

	/** Oracle for validating the interval collection state */
	intervalCollectionOracle: IntervalCollectionOracle;
}

/**
 * Type guard to check if a SharedString is decorated with an oracle.
 * Returns true if the given ISharedString has an oracle attached
 * @internal
 */
export function hasSharedStringOracle(s: ISharedString): s is IChannelWithOracles {
	return "sharedStringOracle" in s && s.sharedStringOracle instanceof SharedStringOracle;
}

/**
 * @internal
 */
export function hasIntervalCollectionOracle(s: ISharedString): s is IChannelWithOracles {
	return (
		"intervalCollectionOracle" in s &&
		s.intervalCollectionOracle instanceof IntervalCollectionOracle
	);
}
