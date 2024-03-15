/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
	// Run jest against pre-built CommonJS javascript.
	// 1. ts-jest does not handle Node16 config and use of .cts files sufficiently. It
	//    is possible to run directly against the TypeScript source (<rootDir>/src),
	//    if tsconfig is changed to CommonJs+Bundler.
	// 2. ESNext+Bundler with "cross-env NODE_OPTIONS=--experimental-vm-modules" is also
	//    not sufficient to address .cts issues even with a patch to address
	//    https://github.com/kulshekhar/ts-jest/issues/3996.
	//
	// Two other options were not investigated:
	// A. expose internal/test exports for components directly tested here and use self-reference
	//    (see https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name),
	//    which should use the built package files (remove references in tsconfig for good
	//    measure).
	// B. Replace ts-jest with babel.
	//
	// It is good to run against the pre-built source as we know that we are testing exactly the
	// production source. Testing against ESM would be preferred. So option A has merit even if
	// other things come along.
	roots: ["<rootDir>/dist"],
	reporters: [
		"default",
		[
			"jest-junit",
			{
				outputDirectory: "nyc",
				outputName: "jest-junit-report.xml",
			},
		],
	],
	transform: {
		// uncomment when attempting run against TypeScript source:
		// "^.+\\.c?tsx?$": [
		// 	"ts-jest",
		// 	{
		// 		tsconfig: "src/test/jest/tsconfig.json",
		// 	},
		// ],
	},
	// This regex will match source (TypeScript) or transpiled (JavaScript) files.
	// Change `roots` to select between those.
	testRegex: "test/jest/.*\\.test\\.[jt]sx?$",
	testPathIgnorePatterns: ["/node_modules/"],
	moduleNameMapper: {
		// Remove explicit .(c)js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.c?js$": "$1",
	},
	moduleFileExtensions: ["ts", "tsx", "cts", "mts", "js", "cjs", "mjs", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/", "/dist/test/"],
	testEnvironment: "jsdom",
};
