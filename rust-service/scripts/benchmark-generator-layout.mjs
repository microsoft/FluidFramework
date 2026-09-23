/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";

/**
 * Selects separate physical cores for bounded generator processes.
 *
 * Four processes remain the compatibility default. Capacity campaigns can
 * request up to eight without changing service affinity.
 */
export function generatorLayout(configuration) {
	const count = configuration.generatorProcesses ?? Math.min(4, configuration.documents);
	assert.ok(Number.isInteger(count) && count >= 1 && count <= 8, "generatorProcesses");
	assert.equal(
		configuration.documents % count,
		0,
		"documents must divide evenly across generator processes",
	);
	if (configuration.generator === "native") {
		assert.equal(
			configuration.rate % count,
			0,
			"native rate must divide evenly across generator processes",
		);
	}
	return {
		count,
		cpus: Array.from({ length: count }, (_, index) => 16 + index * 2),
	};
}
