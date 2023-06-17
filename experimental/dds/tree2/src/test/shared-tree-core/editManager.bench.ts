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
		readonly nbRebased: number;
		readonly nbTrunk: number;
	}

	const scenarios: Scenario[] = [
		// { type: BenchmarkType.Perspective, nbRebased: 1, nbTrunk: 1 },
		// { type: BenchmarkType.Perspective, nbRebased: 10, nbTrunk: 1 },
		// { type: BenchmarkType.Perspective, nbRebased: 100, nbTrunk: 1 },
		{ type: BenchmarkType.Perspective, nbRebased: 1000, nbTrunk: 1 },
		// { type: BenchmarkType.Perspective, nbRebased: 1, nbTrunk: 10 },
		// { type: BenchmarkType.Perspective, nbRebased: 1, nbTrunk: 100 },
		// { type: BenchmarkType.Perspective, nbRebased: 1, nbTrunk: 1000 },
		// { type: BenchmarkType.Perspective, nbRebased: 100, nbTrunk: 100 },
	];

	describe("Local commit rebasing", () => {
		for (const scenario of scenarios) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `Rebase ${scenario.nbRebased} local commits over ${scenario.nbTrunk} trunk commits`,
				benchmarkFn: () => {
					const rebaser = new NoOpChangeRebaser();
					rebaseLocalEditsOverTrunkEdits(scenario.nbRebased, scenario.nbTrunk, rebaser);
				},
			});
		}
	});
	describe("Peer commit rebasing", () => {
		for (const scenario of scenarios) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `Rebase ${scenario.nbRebased} peer commits over ${scenario.nbTrunk} trunk commits`,
				benchmarkFn: () => {
					const rebaser = new NoOpChangeRebaser();
					rebasePeerEditsOverTrunkEdits(scenario.nbRebased, scenario.nbTrunk, rebaser);
				},
			});
		}
	});
});
