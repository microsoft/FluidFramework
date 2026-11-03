/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	debugAssert,
	nonProductionConditionalsIncluded,
	prefixPredicate,
} from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * The levels of rebase validation that can be {@link (RebaseValidation:interface).setLevel | set}.
 * @remarks
 * All validation is tree-shaken out of production/optimized builds.
 * @alpha
 */
export const RebaseValidationLevel = {
	/** No rebase validation is performed. */
	None: 0,
	/** A minimal amount of rebase validation is performed, with minimal performance overhead. */
	Cheap: 1,
	/** Extensive rebase validation is performed, with the highest performance overhead. */
	Strict: 2,
} as const;

/**
 * A level of rebase validation supported by {@link (RebaseValidation:interface)}.
 * @alpha
 */
export type RebaseValidationLevel =
	(typeof RebaseValidationLevel)[keyof typeof RebaseValidationLevel];

/**
 * The entry point for configuring and querying the status of rebase validation.
 * This validation can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
 *
 * @alpha
 */
export interface RebaseValidation {
	/**
	 * The current level of rebase validation.
	 * Configurable via {@link (RebaseValidation:interface).setLevel}.
	 * @remarks
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly currentLevel: RebaseValidationLevel;

	/**
	 * The levels of rebase validation that can be {@link (RebaseValidation:interface).setLevel | set}.
	 * @remarks
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly Level: typeof RebaseValidationLevel;

	/**
	 * Sets the desired {@link (RebaseValidation:interface).Level | level} of rebase validation.
	 * @param level - The desired level of rebase validation.
	 * @returns The previous level in effect immediately before this call.
	 * @throws for levels higher than `RebaseValidation.Level.None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is `RebaseValidation.Level.Cheap`.
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly setLevel: (level: RebaseValidationLevel) => RebaseValidationLevel;

	/**
	 * Sets the desired {@link (RebaseValidation:interface).Level | level} of rebase validation until the provided callback returns.
	 * Restores the current level of rebase validation after that.
	 * @param level - The desired level of rebase validation.
	 * @param callback - The function to execute while the specified validation level is in effect.
	 * @returns the value returned by the callback function (if any).
	 * @throws for levels higher than `RebaseValidation.Level.None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is `RebaseValidation.Level.Cheap`.
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly runWithLevel: <TOut>(level: RebaseValidationLevel, callback: () => TOut) => TOut;
}

let rebaseValidationLevel: RebaseValidationLevel = RebaseValidationLevel.Cheap;

/**
 * Implements {@link (RebaseValidation:interface).setLevel} without referencing the configuration object,
 * thus making tree-shaking of the validation logic possible.
 */
function setLevel(level: RebaseValidationLevel): RebaseValidationLevel {
	if (level !== RebaseValidationLevel.None && !nonProductionConditionalsIncluded()) {
		throw new UsageError(
			"Rebase validation cannot be enabled because debug asserts have been optimized out",
		);
	}
	const old = rebaseValidationLevel;
	rebaseValidationLevel = level;
	return old;
}

/**
 * The entry point for configuring and querying the status of rebase validation.
 * This validation can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
 * @remarks
 * All validation is tree-shaken out of production/optimized builds.
 * @alpha
 */
export const RebaseValidation: RebaseValidation = {
	get currentLevel(): RebaseValidationLevel {
		return rebaseValidationLevel;
	},
	Level: RebaseValidationLevel,
	setLevel,
	runWithLevel: <TOut>(level: RebaseValidationLevel, callback: () => TOut): TOut => {
		const old = setLevel(level);
		try {
			return callback();
		} finally {
			rebaseValidationLevel = old;
		}
	},
};

/**
 * Runs a debug assertion when the validation {@link (RebaseValidation:interface).Level | level} is `RebaseValidation.Level.Cheap` or `RebaseValidation.Level.Strict`.
 * @param prefix - A string to prepend to the debug assertion message if the assertion fails. Used to provide context for the assertion.
 * @param predicate - A function that returns `true` if the assertion passes, or an error message if it fails.
 * @remarks
 * All validation is tree-shaken out of production/optimized builds.
 */
export function cheapRebaseValidation(prefix: string, predicate: () => true | string): void {
	debugAssert(() =>
		RebaseValidation.currentLevel >= RebaseValidationLevel.Cheap
			? prefixPredicate(prefix, predicate())
			: true,
	);
}

/**
 * Runs a debug assertion when the validation {@link (RebaseValidation:interface).Level | level} is `RebaseValidation.Level.Strict`.
 * @param prefix - A string to prepend to the debug assertion message if the assertion fails. Used to provide context for the assertion.
 * @param predicate - A function that returns `true` if the assertion passes, or an error message if it fails.
 * @remarks
 * All validation is tree-shaken out of production/optimized builds.
 */
export function strictRebaseValidation(prefix: string, predicate: () => true | string): void {
	debugAssert(() =>
		RebaseValidation.currentLevel === RebaseValidationLevel.Strict
			? prefixPredicate(prefix, predicate())
			: true,
	);
}

// The `no-console` rule is enabled (for the remainder of this file only) so that lint fails if the lines below are left uncommented.
/* eslint no-console: "error" -- Guards against inadvertently committing the call below. */
// Uncomment the next three lines to enable rebase validation for debugging purposes.
// console.debug(
// 	`Rebase validation changed from ${RebaseValidation.setLevel(RebaseValidationLevel.Strict)} to ${RebaseValidationLevel.Strict}`,
// );
