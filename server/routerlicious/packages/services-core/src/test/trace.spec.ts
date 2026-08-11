/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { StageTrace } from "../trace";
import { performance } from "@fluidframework/common-utils";

describe("StageTrace", () => {
	let clock: sinon.SinonFakeTimers;
	beforeEach(() => {
		// Stub the `globalThis.performance.now` method
		clock = sinon.useFakeTimers({ now: 0 });
		sinon.stub(performance, "now").callsFake(() => Date.now());
	});

	afterEach(() => {
		sinon.restore();
	});
	it("should initialize with initial stage", () => {
		const trace = new StageTrace("initial");
		assert.strictEqual(trace.trace[0]?.stage, "initial");
	});
	it("should initialize without initial stage", () => {
		const trace = new StageTrace();
		assert.strictEqual(trace.trace.length, 0);
	});
	it("should stamp stages with relative timestamps", () => {
		const start = performance.now();
		const trace = new StageTrace("start");
		clock.tick(50);
		trace.stampStage("middle");
		clock.tick(50);
		trace.stampStage("end");

		const traces = trace.trace;
		assert.strictEqual(traces.length, 3);
		assert.strictEqual(traces[0].stage, "start");
		assert.strictEqual(traces[1].stage, "middle");
		assert.strictEqual(traces[2].stage, "end");
		// 0 for initial stage
		assert.strictEqual(traces[0].ts, start);
		// 50ms between start and middle
		assert.strictEqual(traces[1].ts, 50);
		// 50ms between middle and end
		assert.strictEqual(traces[2].ts, 50);
	});
});
