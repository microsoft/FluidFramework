/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["{src,lib}/test/*.vitest.?(c|m)[jt]s?(x)"],
		reporters: [["junit", { suiteName: "build-infrastructure" }], "default"],
		outputFile: {
			junit: "nyc/vitest-junit-report.xml",
		},
		coverage: {
			provider: "v8",
			all: true,
			include: ["lib/**/*.*ts", "lib/**/*.*js"],
			reporter: ["cobertura", "html", "text"],
			reportsDirectory: "./nyc/report/vitest",
		},
		snapshotFormat: {
			// Disable sorting -- this setting doesn't work. It has no effect, despite the documentation indicates it does.
			// https://github.com/jestjs/jest/blob/main/packages/pretty-format/README.md#config
			//
			// One possible workaround is to JSON stringify the objects to be snapshotted.
			// See src/test/snapshotEphemeralRuntime.ts for an example.
			compareKeys: null,
		},
		resolveSnapshotPath: (testPath, snapExtension) =>
			// Store the snapshots for both the TS and ESM tests in the src/test/__snapshots__ folder.
			path.join("src", "test", "__snapshots__", path.basename(testPath)) + snapExtension,
	},
});
