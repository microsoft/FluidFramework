/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { emulateProductionBuild } from "@fluidframework/core-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { RebaseValidation } from "../../core/index.js";

describe("RebaseValidation", () => {
	describe("setLevel", () => {
		it("changes the current validation level", () => {
			RebaseValidation.setLevel(RebaseValidation.Level.None);
			assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.None);
			RebaseValidation.setLevel(RebaseValidation.Level.Cheap);
			assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Cheap);
			RebaseValidation.setLevel(RebaseValidation.Level.Strict);
			assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Strict);
		});

		it("returns the previous validation level", () => {
			RebaseValidation.setLevel(RebaseValidation.Level.None);
			assert.equal(
				RebaseValidation.setLevel(RebaseValidation.Level.Cheap),
				RebaseValidation.Level.None,
			);
			assert.equal(
				RebaseValidation.setLevel(RebaseValidation.Level.Strict),
				RebaseValidation.Level.Cheap,
			);
			assert.equal(
				RebaseValidation.setLevel(RebaseValidation.Level.None),
				RebaseValidation.Level.Strict,
			);
		});

		it("rejects enabling validation in production mode", () => {
			const original = RebaseValidation.currentLevel;
			emulateProductionBuild(true);
			try {
				for (const level of [RebaseValidation.Level.Cheap, RebaseValidation.Level.Strict]) {
					assert.throws(
						() => RebaseValidation.setLevel(level),
						validateUsageError(
							"Rebase validation cannot be enabled because debug asserts have been optimized out",
						),
					);
					assert.equal(RebaseValidation.currentLevel, original);
				}
			} finally {
				emulateProductionBuild(false);
			}
		});
	});

	describe("runWithLevel", () => {
		it("sets the desired level until the callback returns", () => {
			RebaseValidation.runWithLevel(RebaseValidation.Level.Strict, () => {
				assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Strict);
				RebaseValidation.runWithLevel(RebaseValidation.Level.Cheap, () => {
					assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Cheap);
					RebaseValidation.runWithLevel(RebaseValidation.Level.None, () => {
						assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.None);
					});
				});
			});
		});

		it("restores the level after the callback returns", () => {
			const original = RebaseValidation.currentLevel;
			RebaseValidation.runWithLevel(RebaseValidation.Level.Strict, () => {
				RebaseValidation.runWithLevel(RebaseValidation.Level.Cheap, () => {
					RebaseValidation.runWithLevel(RebaseValidation.Level.None, () => {
						assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.None);
					});
					assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Cheap);
				});
				assert.equal(RebaseValidation.currentLevel, RebaseValidation.Level.Strict);
			});
			assert.equal(RebaseValidation.currentLevel, original);
		});

		it("returns the result of the callback", () => {
			const result = RebaseValidation.runWithLevel(RebaseValidation.Level.Strict, () => {
				const nestedResult = RebaseValidation.runWithLevel(RebaseValidation.Level.None, () => {
					return 42;
				});
				assert.equal(nestedResult, 42);
				return 43;
			});
			assert.equal(result, 43);
		});

		it("restores the level when the callback throws", () => {
			const original = RebaseValidation.currentLevel;
			const error = new Error("callback failure");
			assert.throws(
				() =>
					RebaseValidation.runWithLevel(RebaseValidation.Level.Cheap, () => {
						RebaseValidation.runWithLevel(RebaseValidation.Level.Strict, () => {
							throw error;
						});
					}),
				(thrown: unknown) => thrown === error,
			);
			assert.equal(RebaseValidation.currentLevel, original);
		});

		it("rejects enabling validation in production mode", () => {
			const original = RebaseValidation.currentLevel;
			emulateProductionBuild(true);
			try {
				for (const level of [RebaseValidation.Level.Cheap, RebaseValidation.Level.Strict]) {
					assert.throws(
						() => RebaseValidation.runWithLevel(level, () => assert.fail("must not run")),
						validateUsageError(
							"Rebase validation cannot be enabled because debug asserts have been optimized out",
						),
					);
					assert.equal(RebaseValidation.currentLevel, original);
				}
			} finally {
				emulateProductionBuild(false);
			}
		});
	});
});
