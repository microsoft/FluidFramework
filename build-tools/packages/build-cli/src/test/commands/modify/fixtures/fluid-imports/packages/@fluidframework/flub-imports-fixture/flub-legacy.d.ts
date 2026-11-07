/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** @legacy @beta */
export interface LegacyChildLogger {
	readonly entryPoint: "legacy";
}

/** @legacy @beta */
export declare function createChildLogger(): LegacyChildLogger;

/** @legacy @beta */
export declare function publicSymbol(): LegacyChildLogger;

/** @legacy @beta */
export declare function betaSymbol(): LegacyChildLogger;

/** @legacy @beta */
export declare function dedicatedLegacyBeta(): LegacyChildLogger;

/** @legacy @alpha */
export declare function dedicatedLegacyAlpha(): LegacyChildLogger;

/** @legacy @beta */
export declare function legacyBetaFallback(): LegacyChildLogger;

/** @legacy @alpha */
export declare function legacyAlphaFallback(): LegacyChildLogger;

/** @alpha */
export declare function legacyPreferredAlpha(): LegacyChildLogger;
