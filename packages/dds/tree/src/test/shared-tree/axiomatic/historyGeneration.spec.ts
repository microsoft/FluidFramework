/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ForestTypeOptimized, type TreeCheckout } from "../../../shared-tree/index.js";

import type { SharedTreeTestOperation } from "./changeGeneration.js";
import { generateSharedTreeHistories } from "./historyGeneration.js";
import {
	createMultiFieldFixture,
	operationDescriptorsFromCheckout,
	operationGenerator,
} from "./multiFieldFixture.js";

type OperationSource<TConfig> = (
	state: TreeCheckout,
	depth: number,
	config: TConfig,
) => Iterable<SharedTreeTestOperation>;

function observeForks<TConfig>(
	source: OperationSource<TConfig>,
	events: string[],
): OperationSource<TConfig> {
	return function* (state, depth, config) {
		for (const operation of source(state, depth, config)) {
			yield {
				description: operation.description,
				apply: (child: TreeCheckout) => {
					events.push(`create ${depth}`);
					child.events.on("dispose", () => {
						events.push(`dispose ${depth}`);
					});
					operation.apply(child);
				},
			};
		}
	};
}

describe("SharedTree axiom infrastructure: history generation", () => {
	let parent: TreeCheckout;
	beforeEach(() => {
		parent = createMultiFieldFixture(ForestTypeOptimized);
	});
	afterEach(() => {
		parent.dispose();
	});

	it("generated operations are serializable", () => {
		const descriptors = [
			...operationDescriptorsFromCheckout(parent, 0, { removeMovedNode: true }),
		];
		// eslint-disable-next-line unicorn/prefer-structured-clone -- Verify a JSON serialization roundtrip, not general cloning.
		assert.deepEqual(JSON.parse(JSON.stringify(descriptors)), descriptors);
	});

	it("operation generation is deterministic", () => {
		const descriptors1 = [
			...operationDescriptorsFromCheckout(parent, 0, { removeMovedNode: true }),
		];
		const descriptors2 = [
			...operationDescriptorsFromCheckout(parent, 0, { removeMovedNode: true }),
		];
		assert.deepEqual(JSON.stringify(descriptors1), JSON.stringify(descriptors2));
	});

	it("disposes all exploration forks on completion", () => {
		const events: string[] = [];
		const source = observeForks(operationGenerator, events);
		const _evaluated = [
			...generateSharedTreeHistories(parent, source, 2, { removeMovedNode: true }),
		];
		const createdCount = events.filter((event) => event.startsWith("create")).length;
		const disposedCount = events.filter((event) => event.startsWith("dispose")).length;
		assert.equal(disposedCount, createdCount);
	});

	it("disposes nested forks in descendant-first order on early exit", () => {
		const events: string[] = [];
		const source = observeForks(operationGenerator, events);
		for (const history of generateSharedTreeHistories(parent, source, 2, {
			removeMovedNode: true,
		})) {
			assert.equal(history.length, 2);
			assert.deepEqual(events, ["create 0", "create 1"]);
			break;
		}
		assert.deepEqual(events, ["create 0", "create 1", "dispose 1", "dispose 0"]);
	});
});
