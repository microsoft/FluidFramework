/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	oxc: {
		jsx: {
			runtime: "automatic",
		},
	},
	test: {
		include: ["test/unit/**/*.test.{ts,tsx}"],
	},
});
