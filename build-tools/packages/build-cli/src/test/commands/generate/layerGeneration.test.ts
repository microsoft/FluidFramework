/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { Logger } from "@fluidframework/build-tools";
import { describe, it } from "mocha";

import UpdateGenerationCommand, {
	daysInMonthApproximation,
	formatDateForLayerFile,
	generateLayerFileContent,
	maybeGetNewGeneration,
} from "../../../commands/generate/layerGeneration.js";

describe("generate:layerGeneration", () => {
	const minimumCompatWindowMonths = UpdateGenerationCommand.flags.minimumCompatWindowMonths
		.default as number;
	// Mock logger that captures log calls for verification
	const createMockLogger = (): Logger => {
		return {
			log: (): void => {},
			info: (): void => {},
			warning: (): void => {},
			errorLog: (): void => {},
			verbose: (): void => {},
		};
	};

	it("should not change generation when package version has not changed", () => {
		const mockLogger = createMockLogger();
		const currentVersion = "2.0.0";
		const fileContent = generateLayerFileContent(5, "01/01/2025", currentVersion);

		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			currentVersion,
			mockLogger,
		);

		assert.strictEqual(result, undefined);
	});

	it("should not change generation when only patch version has changed", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;
		const previousVersion = "2.0.0";
		const currentVersion = "2.0.1"; // Only patch change

		// Create a date 2 months ago (should normally trigger increment)
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 2 * daysInMonthApproximation);
		const oldDateString = formatDateForLayerFile(oldDate);
		const fileContent = generateLayerFileContent(
			previousGeneration,
			oldDateString,
			previousVersion,
		);

		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			currentVersion,
			mockLogger,
		);

		assert.strictEqual(result, undefined);
	});

	it("should not change generation when both minor and patch version has changed", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;
		// This scenario can happen when a minor release is made but generation is not updated,
		// followed by a patch release. In this case, generation should not update on the patch.
		const previousVersion = "2.0.0";
		const currentVersion = "2.1.1"; // Both minor and patch change

		// Create a date 2 months ago (should normally trigger increment)
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 2 * daysInMonthApproximation);
		const oldDateString = formatDateForLayerFile(oldDate);
		const fileContent = generateLayerFileContent(
			previousGeneration,
			oldDateString,
			previousVersion,
		);

		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			currentVersion,
			mockLogger,
		);

		assert.strictEqual(result, undefined);
	});

	it("should update generation when time since last release is 1+ months with minor version change", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;
		const monthsSincePreviousRelease = 1; // More than 1 month

		// Create a date monthsSincePreviousRelease months ago
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - monthsSincePreviousRelease * daysInMonthApproximation);
		const oldDateString = formatDateForLayerFile(oldDate);
		const fileContent = generateLayerFileContent(previousGeneration, oldDateString, "1.0.0");
		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			"1.1.0", // Minor version change
			mockLogger,
		);

		assert.strictEqual(result, previousGeneration + monthsSincePreviousRelease);
	});

	it("should update generation when time since last release is 1+ months with major version change", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;
		const monthsSincePreviousRelease = 2; // 2 months

		// Create a date monthsSincePreviousRelease months ago
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - monthsSincePreviousRelease * daysInMonthApproximation);
		const oldDateString = formatDateForLayerFile(oldDate);
		const fileContent = generateLayerFileContent(previousGeneration, oldDateString, "1.0.0");
		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			"2.0.0", // Major version change
			mockLogger,
		);

		assert.strictEqual(result, previousGeneration + monthsSincePreviousRelease);
	});

	it("should not update generation when time since last release is < 1 month", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;
		const daysSincePreviousRelease = 31; // Less than approx. 1 month

		// Create a date daysSincePreviousRelease days ago
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - daysSincePreviousRelease);
		const oldDateString = formatDateForLayerFile(oldDate);
		const fileContent = generateLayerFileContent(previousGeneration, oldDateString, "1.0.0");
		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			"1.1.0", // Minor version change but not enough time elapsed
			mockLogger,
		);

		assert.strictEqual(result, undefined);
	});

	it("should cap generation increment to minimumCompatWindowMonths - 1", () => {
		const mockLogger = createMockLogger();
		const previousGeneration = 5;

		// Create a date 12 months ago (way beyond threshold)
		const veryOldDate = new Date();
		veryOldDate.setFullYear(veryOldDate.getFullYear() - 1);
		const veryOldDateString = formatDateForLayerFile(veryOldDate);
		const fileContent = generateLayerFileContent(
			previousGeneration,
			veryOldDateString,
			"1.0.0",
		);
		const result = maybeGetNewGeneration(
			"layerGenerationState.ts",
			fileContent,
			minimumCompatWindowMonths,
			"2.0.0", // Major version change
			mockLogger,
		);

		assert.strictEqual(result, previousGeneration + minimumCompatWindowMonths - 1);
	});

	it("should calculate generation increment correctly for various time periods", () => {
		// Previous version is older than the currentVersion in all test cases
		const previousVersion = "1.0.0";
		const testCases = [
			{
				monthsAgo: 1,
				expectedIncrement: 1,
				minimumCompatWindowMonths: 3,
				currentVersion: "1.1.0",
			},
			{
				monthsAgo: 2,
				expectedIncrement: 2,
				minimumCompatWindowMonths: 3,
				currentVersion: "1.2.0",
			},
			{
				monthsAgo: 3,
				expectedIncrement: 2,
				minimumCompatWindowMonths: 3,
				currentVersion: "2.0.0",
			}, // Capped at 2
			{
				monthsAgo: 6,
				expectedIncrement: 2,
				minimumCompatWindowMonths: 3,
				currentVersion: "2.1.0",
			}, // Capped at 2
			{
				monthsAgo: 4,
				expectedIncrement: 4,
				minimumCompatWindowMonths: 6,
				currentVersion: "1.3.0",
			}, // Not capped
			{
				monthsAgo: 8,
				expectedIncrement: 5,
				minimumCompatWindowMonths: 6,
				currentVersion: "3.0.0",
			}, // Capped at 5
		];

		for (const testCase of testCases) {
			const mockLogger = createMockLogger();
			const previousGeneration = 5;
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - testCase.monthsAgo * daysInMonthApproximation);
			const oldDateString = formatDateForLayerFile(oldDate);
			const fileContent = generateLayerFileContent(
				previousGeneration,
				oldDateString,
				previousVersion,
			);
			const result = maybeGetNewGeneration(
				"layerGenerationState.ts",
				fileContent,
				testCase.minimumCompatWindowMonths,
				testCase.currentVersion,
				mockLogger,
			);

			const expectedGeneration = previousGeneration + testCase.expectedIncrement;
			assert.strictEqual(
				result,
				expectedGeneration,
				`Failed for ${testCase.monthsAgo} months ago with window ${testCase.minimumCompatWindowMonths}`,
			);
		}
	});

	it("should throw error for malformed generation file content", () => {
		const mockLogger = createMockLogger();
		const invalidContent = "invalid content";

		assert.throws(() => {
			maybeGetNewGeneration(
				"layerGenerationState.ts",
				invalidContent,
				minimumCompatWindowMonths,
				"2.0.0",
				mockLogger,
			);
		}, /layerGenerationState\.ts content not as expected/);
	});

	it("should throw error for missing generation export", () => {
		const mockLogger = createMockLogger();
		const invalidContent = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const releaseDate = "01/01/2025";
export const pkgVersion = "1.0.0";
`;

		assert.throws(() => {
			maybeGetNewGeneration(
				"layerGenerationState.ts",
				invalidContent,
				minimumCompatWindowMonths,
				"2.0.0",
				mockLogger,
			);
		}, /layerGenerationState\.ts content not as expected/);
	});

	it("should fail when current date is older than previous release date", () => {
		const mockLogger = createMockLogger();

		// Test with a future date
		const futureDate = new Date();
		futureDate.setMonth(futureDate.getMonth() + 2);
		const futureDateString = formatDateForLayerFile(futureDate);

		const fileContent = generateLayerFileContent(5, futureDateString, "1.0.0");

		assert.throws(
			() =>
				maybeGetNewGeneration(
					"layerGenerationState.ts",
					fileContent,
					minimumCompatWindowMonths,
					"2.0.0", // Major version change
					mockLogger,
				),
			/Current date is older that previous release date/,
		);
	});

	it("should generate correctly formatted output", () => {
		const result = generateLayerFileContent(42, "12/25/2025", "3.0.0");

		// Check that it includes the copyright header
		assert(result.includes("Copyright (c) Microsoft Corporation"));
		assert(result.includes("THIS IS AN AUTOGENERATED FILE"));

		// Check the exports
		assert(result.includes("export const generation = 42;"));
		assert(result.includes('export const releaseDate = "12/25/2025";'));
		assert(result.includes('export const pkgVersion = "3.0.0";'));

		// Ensure proper formatting
		assert(/export const generation = \d+;/.test(result));
		assert(/export const releaseDate = "(?:\d{2}\/){2}\d{4}";/.test(result));
		assert(/export const pkgVersion = "[\d.]+";/.test(result));
	});
});
