/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import { NoOpChangeRebaser } from "../testChange";
import {
	rebaseConcurrentPeerEdits,
	rebaseLocalEditsOverTrunkEdits,
	rebasePeerEditsOverTrunkEdits,
} from "./editManagerTestUtils";

describe("EditManager - Bench", () => {
	interface Scenario {
		readonly type: BenchmarkType;
		readonly rebasedEditCount: number;
		readonly trunkEditCount: number;
	}

	const scenarios: Scenario[] = [
		{ type: BenchmarkType.Perspective, rebasedEditCount: 1, trunkEditCount: 1 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 10, trunkEditCount: 1 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 100, trunkEditCount: 1 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 1000, trunkEditCount: 1 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 1, trunkEditCount: 10 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 1, trunkEditCount: 100 },
		{ type: BenchmarkType.Perspective, rebasedEditCount: 1, trunkEditCount: 1000 },
		{ type: BenchmarkType.Measurement, rebasedEditCount: 100, trunkEditCount: 100 },
	];

	describe("Local commit rebasing", () => {
		for (const { type, rebasedEditCount, trunkEditCount } of scenarios) {
			benchmark({
				type,
				title: `Rebase ${rebasedEditCount} local commits over ${trunkEditCount} trunk commits`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const rebaser = new NoOpChangeRebaser();
						const rebasing = rebaseLocalEditsOverTrunkEdits(
							rebasedEditCount,
							trunkEditCount,
							rebaser,
							true,
						);

						// Measure
						const before = state.timer.now();
						rebasing();
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);
						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});
	describe("Peer commit rebasing", () => {
		for (const { type, rebasedEditCount, trunkEditCount } of scenarios) {
			benchmark({
				type,
				title: `Rebase ${rebasedEditCount} peer commits over ${trunkEditCount} trunk commits`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const rebaser = new NoOpChangeRebaser();
						const rebasing = rebasePeerEditsOverTrunkEdits(
							rebasedEditCount,
							trunkEditCount,
							rebaser,
							true,
						);

						// Measure
						const before = state.timer.now();
						rebasing();
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);
						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});
	describe("Multi-peer commit rebasing", () => {
		interface MultiPeerScenario {
			readonly type: BenchmarkType;
			readonly peerCount: number;
			readonly editsPerPeerCount: number;
		}

		const multiPeerScenarios: MultiPeerScenario[] = [
			{ type: BenchmarkType.Perspective, peerCount: 10, editsPerPeerCount: 10 },
			{ type: BenchmarkType.Perspective, peerCount: 10, editsPerPeerCount: 20 },
			{ type: BenchmarkType.Perspective, peerCount: 20, editsPerPeerCount: 10 },
			{ type: BenchmarkType.Measurement, peerCount: 20, editsPerPeerCount: 20 },
		];
		for (const { type, peerCount, editsPerPeerCount } of multiPeerScenarios) {
			benchmark({
				type,
				title: `Rebase edits from ${peerCount} peers each sending ${editsPerPeerCount} commits`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const rebaser = new NoOpChangeRebaser();
						const rebasing = rebaseConcurrentPeerEdits(
							peerCount,
							editsPerPeerCount,
							rebaser,
							true,
						);

						// Measure
						const before = state.timer.now();
						rebasing();
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);
						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});
});
