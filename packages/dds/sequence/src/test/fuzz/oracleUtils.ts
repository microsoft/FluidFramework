/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedString } from "../../sharedString.js";

import { SharedStringOracle } from "./sharedStringOracle.js";

/**
 * A channel decorated with one or more oracles for validation.
 * @internal
 */
export interface IChannelWithOracles extends ISharedString {
	/** Oracle for validating the SharedString state */
	sharedStringOracle: SharedStringOracle;
}

/**
 * Type guard to check if a SharedString is decorated with an oracle.
 * Returns true if the given ISharedString has an oracle attached
 * @internal
 */
export function hasSharedStringOracle(s: ISharedString): s is IChannelWithOracles {
	return "sharedStringOracle" in s && s.sharedStringOracle instanceof SharedStringOracle;
}
