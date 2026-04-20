/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared throttle profiles for Lighthouse testing.
 *
 * DevTools throttling applies adjustment factors to convert "real-world"
 * RTT/throughput into values that produce realistic timings inside Chrome's
 * network stack.
 */

const DEVTOOLS_RTT_ADJUSTMENT_FACTOR = 3.75;
const DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR = 0.9;

const throttleProfiles = {
	// Desktop: no network throttling, no CPU slowdown.
	desktop: {
		throttlingMethod: "provided",
		throttling: {
			cpuSlowdownMultiplier: 1,
			requestLatencyMs: 0,
			downloadThroughputKbps: 0,
			uploadThroughputKbps: 0,
			throughputKbps: 0,
			rttMs: 0,
		},
	},
	// Mobile P75 (2026): 9 Mbps down, 3 Mbps up, 100ms RTT, 4x CPU slowdown.
	// Source: https://infrequently.org/2025/11/performance-inequality-gap-2026/
	mobile: {
		throttlingMethod: "devtools",
		throttling: {
			rttMs: 100,
			throughputKbps: 9 * 1024,
			requestLatencyMs: 100 * DEVTOOLS_RTT_ADJUSTMENT_FACTOR,
			downloadThroughputKbps: 9 * 1024 * DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR,
			uploadThroughputKbps: 3 * 1024 * DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR,
			cpuSlowdownMultiplier: 4,
		},
	},
};

module.exports = { throttleProfiles };
