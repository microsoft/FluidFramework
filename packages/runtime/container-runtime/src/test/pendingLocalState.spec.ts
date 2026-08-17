/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { isPendingLocalStateReusable } from "../pendingLocalState.js";

function makePendingLocalState(pendingRuntimeState?: unknown): string {
	return JSON.stringify({
		attached: true,
		baseSnapshot: {},
		snapshotBlobs: {},
		savedOps: [],
		url: "fluid://example",
		pendingRuntimeState,
	});
}

describe("isPendingLocalStateReusable", () => {
	it("returns true when pending runtime state is absent", () => {
		assert.equal(isPendingLocalStateReusable(makePendingLocalState()), true);
	});

	for (const pendingRuntimeState of [{}, null, { pending: { pendingStates: [] } }]) {
		it(`returns false when pending runtime state is ${JSON.stringify(pendingRuntimeState)}`, () => {
			assert.equal(
				isPendingLocalStateReusable(makePendingLocalState(pendingRuntimeState)),
				false,
			);
		});
	}

	it("returns false for detached container state", () => {
		const state = JSON.parse(makePendingLocalState()) as Record<string, unknown>;
		state.attached = false;
		assert.equal(isPendingLocalStateReusable(JSON.stringify(state)), false);
	});

	for (const malformedState of ["", "null", "{}", '{"attached":true}']) {
		it(`returns false for malformed state ${JSON.stringify(malformedState)}`, () => {
			assert.equal(isPendingLocalStateReusable(malformedState), false);
		});
	}
});
