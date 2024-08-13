/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		reporters: ["junit", "default", "json"],
		outputFile: {
			junit: "nyc/junit-report.xml",
			json: "nyc/junit-report.json",
		},
		coverage: {
			provider: "v8",
			all: true,
			include: ["src/**/*.*ts", "lib/**/*.*js"],
			// exclude: ["src/test/**/*.*ts", "lib/test/**/*.*js"],
			reporter: ["cobertura", "html", "text"],
			reportsDirectory: "./nyc/report",
		},
	},
});
