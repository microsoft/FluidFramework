/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Lighthouse CI configuration.
 *
 * LHCI collects Lighthouse audits against the production webpack build served
 * from `dist/`. Results are asserted locally and can optionally be uploaded to
 * a LHCI server or stored as temporary public storage.
 *
 * Run: `npm run lighthouse`
 *
 * @see https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
 */

const { throttleProfiles } = require("./throttleProfiles.cjs");

module.exports = {
	ci: {
		collect: {
			// Serve the production build and run Lighthouse against it.
			staticDistDir: "./dist",
			// Number of Lighthouse runs per URL (median is reported).
			numberOfRuns: 3,
			// Retry on transient headless Chrome failures.
			maxRetries: 2,
			settings: {
				// Only run the performance category — we don't need accessibility,
				// SEO, etc. for a headless perf test page.
				onlyCategories: ["performance"],
				// Use desktop settings to reduce variability in CI.
				preset: "desktop",
				// Apply the mobile throttle profile.
				...throttleProfiles.mobile,
			},
		},
		assert: {
			assertions: {
				// Ensure the boot trace completes within a reasonable time budget.
				"interactive": ["warn", { maxNumericValue: 3000 }],
				"speed-index": ["warn", { maxNumericValue: 3000 }],
				"total-blocking-time": ["warn", { maxNumericValue: 500 }],
			},
		},
		upload: {
			// Use temporary public storage so results are viewable without a
			// dedicated LHCI server. Switch to "lhci" target when a server is
			// available.
			target: "temporary-public-storage",
		},
	},
};
