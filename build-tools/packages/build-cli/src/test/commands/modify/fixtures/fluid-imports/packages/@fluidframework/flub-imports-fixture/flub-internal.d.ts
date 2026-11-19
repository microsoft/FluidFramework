/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** @internal */
export interface InternalChildLogger {
	readonly entryPoint: "internal";
}

/**
 * @internal
 * Intentionally distinct from the `/legacy` createChildLogger declaration.
 */
export declare function createChildLogger(): InternalChildLogger;

/** @internal */
export interface InternalOnly {
	readonly entryPoint: "internal";
}

/** @internal */
export declare function internalOnly(): InternalOnly;

/** @internal */
export declare function publicSymbol(): InternalChildLogger;

/** @internal */
export declare function betaSymbol(): InternalChildLogger;

/** @internal */
export interface BetaType {
	readonly entryPoint: "internal";
}

/** @legacy @beta */
export declare function dedicatedLegacyBeta(): InternalChildLogger;

/** @legacy @alpha */
export declare function dedicatedLegacyAlpha(): InternalChildLogger;

/** @legacy @beta */
export declare function legacyBetaFallback(): InternalChildLogger;

/** @legacy @alpha */
export declare function legacyAlphaFallback(): InternalChildLogger;

/** @alpha */
export declare function alphaSymbol(): InternalChildLogger;

/** @alpha */
export declare function legacyPreferredAlpha(): InternalChildLogger;

export declare function untaggedBetaSymbol(): InternalChildLogger;
