/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedString } from "../../sharedString.js";
import { IntervalCollectionOracle } from "../intervalCollectionOracle.js";

import { SharedStringOracle } from "./sharedStringOracle.js";

/**
 * A channel decorated with one or more oracles for validation.
 * @internal
 */
export interface IChannelWithOracles extends ISharedString {
	/** Oracle for validating the SharedString state */
	sharedStringOracle: SharedStringOracle;
	intervalOracles: Map<string, IntervalCollectionOracle>;
}

/**
 * Type guard to check if a SharedString is decorated with a SharedString oracle.
 * Returns true if the given ISharedString has a SharedString oracle attached
 * @internal
 */
export function hasSharedStringOracle(s: ISharedString): s is IChannelWithOracles {
	return "sharedStringOracle" in s && s.sharedStringOracle instanceof SharedStringOracle;
}

/**
 * Type guard to check if a SharedString is decorated with interval collection oracles.
 * Returns true if the given ISharedString has interval oracles attached
 * @internal
 */
export function hasIntervalCollectionOracles(s: ISharedString): s is IChannelWithOracles {
	return "intervalOracles" in s && s.intervalOracles instanceof Map;
}
