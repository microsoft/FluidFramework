/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/test/*.vitest.?(c|m)[jt]s?(x)"],
		reporters: [["junit", { suiteName: "build-infrastructure" }], "default"],
		outputFile: {
			junit: "nyc/junit-report.xml",
		},
		coverage: {
			provider: "v8",
			all: true,
			include: ["lib/**/*.*ts", "lib/**/*.*js"],
			reporter: ["cobertura", "html", "text"],
			reportsDirectory: "./nyc/report",
		},
	},
});
