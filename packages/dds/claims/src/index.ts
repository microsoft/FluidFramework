/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains the {@link ISharedClaims | SharedClaims} distributed
 * data structure: a first-writer-wins key/value store used to wire up
 * singleton entries with race-free semantics.
 *
 * @packageDocumentation
 */

export { SharedClaims, SharedClaimsFactory } from "./claimsFactory.js";
export type {
	ClaimResult,
	IClaimAttempt,
	ISharedClaims,
	ISharedClaimsEvents,
} from "./interfaces.js";
