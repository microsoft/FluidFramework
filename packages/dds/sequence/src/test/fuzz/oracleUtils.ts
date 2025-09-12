/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedString } from "../../sharedString.js";
import { IntervalCollectionOracle } from "../intervalCollectionOracle.js";

/**
 * A channel decorated with one or more oracles for validation.
 * @internal
 */
export interface IChannelWithOracles extends ISharedString {
	/** Oracle for validating the interval collection state */
	intervalCollectionOracle: IntervalCollectionOracle;
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
