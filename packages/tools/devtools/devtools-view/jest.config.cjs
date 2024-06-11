/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
	// Run jest against pre-built JavaScript.
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
	// production source. Option A would allow dynamic test source and exact production results.
	// Testing against ESM is currently preferred and what is configured here.
	// From command line however, roots will be set to ./dist until fluentui has proper ESM support
	// in their dual-emit packages (see https://github.com/microsoft/fluentui/issues/30778).
	roots: ["<rootDir>/lib"],
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
		// Uncomment when attempting run against TypeScript source:
		// "^.+\\.c?tsx?$": [
		// 	"ts-jest",
		// 	{
		// 		tsconfig: "src/test/tsconfig.esm.json",
		// 	},
		// ],
	},
	// This regex will match source (TypeScript) or transpiled (JavaScript) files.
	// Change `roots` to select between those.
	testRegex: "test/.*\\.test\\.[jt]sx?$",
	testPathIgnorePatterns: ["/node_modules/"],
	// Uncomment when attempting run against TypeScript source:
	// moduleNameMapper: {
	// 	// Remove explicit .(c)js from local paths to allow jest to find the .ts* files
	// 	"^(\\.{1,2}/.*)\\.c?js$": "$1",
	// },
	moduleFileExtensions: ["ts", "tsx", "cts", "mts", "js", "cjs", "mjs", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/", "/dist/test/", "/lib/test/"],
	testEnvironment: "jsdom",
};
