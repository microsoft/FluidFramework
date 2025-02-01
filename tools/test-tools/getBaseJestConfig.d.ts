/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function getBaseJestConfig(packageName: string): {
	preset: string;
	globals: {
			PATH: string;
	};
	testMatch: string[];
	testPathIgnorePatterns: string[];
	transform: {
			"^.+\\.ts?$": string;
	};
	reporters: (string | (string | {
			outputDirectory: string;
			outputName: string;
	})[])[];
	moduleNameMapper: Record<string, string>;
}
