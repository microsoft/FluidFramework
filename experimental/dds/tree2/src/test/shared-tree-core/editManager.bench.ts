/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { NoOpChangeRebaser } from "../testChange";
import {
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
				benchmarkFn: () => {
					const rebaser = new NoOpChangeRebaser();
					rebaseLocalEditsOverTrunkEdits(rebasedEditCount, trunkEditCount, rebaser);
				},
			});
		}
	});
	describe("Peer commit rebasing", () => {
		for (const { type, rebasedEditCount, trunkEditCount } of scenarios) {
			benchmark({
				type,
				title: `Rebase ${rebasedEditCount} peer commits over ${trunkEditCount} trunk commits`,
				benchmarkFn: () => {
					const rebaser = new NoOpChangeRebaser();
					rebasePeerEditsOverTrunkEdits(rebasedEditCount, trunkEditCount, rebaser);
				},
			});
		}
	});
});
