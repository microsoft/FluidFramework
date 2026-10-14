/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** @beta */
export interface BetaType {
	readonly entryPoint: "beta";
}

/** @beta */
export declare function betaSymbol(): BetaType;

export declare function untaggedBetaSymbol(): BetaType;
