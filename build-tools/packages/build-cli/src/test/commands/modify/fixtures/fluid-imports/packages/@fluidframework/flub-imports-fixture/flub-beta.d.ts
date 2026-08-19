/** @beta */
export interface BetaType {
	readonly entryPoint: "beta";
}

/** @beta */
export declare function betaSymbol(): BetaType;

export declare function untaggedBetaSymbol(): BetaType;
