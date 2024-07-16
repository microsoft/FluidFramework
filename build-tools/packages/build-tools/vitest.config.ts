/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			all: true,
			include: ["src/**/*.*ts", "lib/**/*.*js"],
			exclude: ["src/test/**/*.*ts", "lib/test/**/*.*js"],
			provider: "v8",
			reportsDirectory: "./nyc/report",
			reporter: ["cobertura", "html", "text"],
		},
	},
});
