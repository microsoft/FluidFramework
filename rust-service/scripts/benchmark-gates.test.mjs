/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assertDrainIntegrity,
	assertSampleGates,
	baselineP95IsStable,
	candidateRssLimit,
	hasPendingDrain,
} from "./benchmark-gates.mjs";

test("Sea drain waits for an acknowledgment that follows the final deliveries", async () => {
	const document = { sent: 1, observed: [0, 0], acknowledgments: 0 };
	assert.equal(hasPendingDrain([document], "sea"), true);
	document.observed = [1, 1];
	let acknowledge;
	const pending = new Promise((resolve) => {
		acknowledge = resolve;
	}).then(() => {
		document.acknowledgments++;
	});
	assert.equal(hasPendingDrain([document], "sea"), true);
	assert.equal(hasPendingDrain([document], "tinylicious"), false);
	acknowledge();
	await pending;
	assert.equal(hasPendingDrain([document], "sea"), false);
	document.observed[1] = 0;
	assert.equal(hasPendingDrain([document], "sea"), true);
	assert.equal(hasPendingDrain([document], "tinylicious"), true);
});

test("drain integrity preserves Tinylicious's unavailable acknowledgment observation", () => {
	const result = { sent: 10, acknowledged: null, missing: 0, errors: [] };
	assert.doesNotThrow(() => assertDrainIntegrity([result], "tinylicious"));
	assert.throws(() => assertDrainIntegrity([result], "sea"), /integrity/);
	assert.throws(
		() => assertDrainIntegrity([{ ...result, acknowledged: 9 }], "sea"),
		/integrity/,
	);
	assert.doesNotThrow(() => assertDrainIntegrity([{ ...result, acknowledged: 10 }], "sea"));
	for (const backend of ["sea", "tinylicious"]) {
		assert.throws(
			() => assertDrainIntegrity([{ ...result, acknowledged: 10, missing: 1 }], backend),
			/integrity/,
		);
		assert.throws(
			() =>
				assertDrainIntegrity([{ ...result, acknowledged: 10, errors: ["corrupt"] }], backend),
			/integrity/,
		);
	}
});

test("candidate RSS allowance is twenty percent or thirty-two MiB", () => {
	assert.equal(candidateRssLimit(100), 132);
	assert.equal(candidateRssLimit(200), 240);
	assert.equal(candidateRssLimit(154.546875), 186.546875);
	assert.throws(() => candidateRssLimit(Number.NaN));
});

test("baseline p95 repeatability allows at most ten percent or one millisecond", () => {
	assert.equal(baselineP95IsStable([2.236127, 2.512874, 2.508116]), true);
	assert.equal(baselineP95IsStable([15.16999, 77.884199, 16.795697]), false);
	assert.equal(baselineP95IsStable([20, 22]), true);
	assert.equal(baselineP95IsStable([20, 22.1]), false);
	assert.equal(baselineP95IsStable([2, 3]), true);
	assert.equal(baselineP95IsStable([2, 3.1]), false);
	assert.throws(() => baselineP95IsStable([Number.NaN]));
});

test("the frozen absolute latency cap applies to candidates, not baselines", () => {
	const result = {
		status: "completed",
		configuration: { rate: 1000, seconds: 10 },
		workers: [
			{
				measuredSent: 10000,
				deliveredInWindow: 10000,
				latencyMilliseconds: { p95: 110 },
				maxScheduleLagMilliseconds: 10,
			},
		],
		aligned: { delivered: 9900, seconds: 9.9 },
	};
	assert.doesNotThrow(() => assertSampleGates(result, "baseline"));
	assert.throws(() => assertSampleGates(result, "candidate"), /absolute p95/);
	result.workers[0].maxScheduleLagMilliseconds = 101;
	assert.throws(() => assertSampleGates(result, "baseline"), /scheduling lag/);
});
