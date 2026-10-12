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
 * The levels of rebase validation that can be {@link RebaseValidation | configured}.
 * @remarks
 * All validation is tree-shaken out of production/optimized builds.
 * @alpha
 */
export enum RebaseValidationLevel {
	/** No rebase validation is performed. */
	None = 0,
	/** A minimal amount of rebase validation is performed, with minimal performance overhead. */
	Cheap = 1,
	/** Extensive rebase validation is performed, with the highest performance overhead. */
	Strict = 2,
}

/**
 * The entry point for configuring and querying the status of rebase validation.
 * This validation can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
 *
 * @alpha
 */
export interface RebaseValidationAlpha {
	/**
	 * The current level of rebase validation.
	 * Configurable via {@link RebaseValidationAlpha.setLevel}.
	 * @remarks
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly currentLevel: RebaseValidationLevel;

	/**
	 * The levels of rebase validation that can be {@link RebaseValidationAlpha.setLevel | set}.
	 * @remarks
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly Level: {
		/** No rebase validation is performed. */
		readonly None: RebaseValidationLevel.None;
		/** A minimal amount of rebase validation is performed, with minimal performance overhead. */
		readonly Cheap: RebaseValidationLevel.Cheap;
		/** Extensive rebase validation is performed, with the highest performance overhead. */
		readonly Strict: RebaseValidationLevel.Strict;
	};

	/**
	 * Sets the desired level of rebase validation.
	 * @param level - The desired level of rebase validation.
	 * @returns The previous level in effect immediately before this call.
	 * @throws for levels higher than `None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is {@link RebaseValidationLevel.Cheap}.
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly setLevel: (level: RebaseValidationLevel) => RebaseValidationLevel;

	/**
	 * Sets the desired level of rebase validation until the provided callback returns and restores the current level of rebase validation after that.
	 * @param level - The desired level of rebase validation.
	 * @param callback - The function to execute while the specified validation level is in effect.
	 * @returns the value returned by the callback function (if any).
	 * @throws for levels higher than `None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is {@link RebaseValidationLevel.Cheap}.
	 * All validation is tree-shaken out of production/optimized builds.
	 */
	readonly runWithLevel: <TOut>(level: RebaseValidationLevel, callback: () => TOut) => TOut;
}

/**
 * Indicates whether rebase validation is currently enabled.
 * See {@link RebaseValidationAlpha.setLevel} for more information.
 */
let rebaseValidationLevel = RebaseValidationLevel.Cheap;

/**
 * The entry point for configuring and querying the status of rebase validation.
 * This validation can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
 * @alpha
 */
export const RebaseValidation: RebaseValidationAlpha = {
	get currentLevel(): RebaseValidationLevel {
		return rebaseValidationLevel;
	},
	Level: {
		None: RebaseValidationLevel.None,
		Cheap: RebaseValidationLevel.Cheap,
		Strict: RebaseValidationLevel.Strict,
	},
	setLevel: (level: RebaseValidationLevel): RebaseValidationLevel => {
		if (level !== RebaseValidationLevel.None && !nonProductionConditionalsIncluded()) {
			throw new UsageError(
				"rebase validation cannot be enabled because debug asserts have been optimized out",
			);
		}
		const old = rebaseValidationLevel;
		rebaseValidationLevel = level;
		return old;
	},
	runWithLevel: <TOut>(level: RebaseValidationLevel, callback: () => TOut): TOut => {
		const old = RebaseValidation.setLevel(level);
		try {
			return callback();
		} finally {
			rebaseValidationLevel = old;
		}
	},
};

/**
 * Runs a debug assertion when the validation level is at least {@link RebaseValidationLevel.Cheap | basic}.
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
 * Runs a debug assertion when the validation level is {@link RebaseValidationLevel.Strict | full}.
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
