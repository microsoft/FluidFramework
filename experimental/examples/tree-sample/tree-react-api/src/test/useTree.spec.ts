/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedTreeFactory } from "@fluid-internal/tree";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import React from "react";
import { SinonSandbox, createSandbox } from "sinon";
import { useTree } from "..";
import { Inventory } from "./schema/inventorySchema";
import { appSchemaData } from "./schema/appSchema";

describe("useTree()", () => {
	function createLocalTree(id: string) {
		const factory = new SharedTreeFactory();
		const tree = factory.create(new MockFluidDataStoreRuntime(), id);
		tree.storedSchema.update(appSchemaData);
		tree.root = {
			nuts: 0,
			bolts: 0,
		};
		return tree;
	}

	// Mock 'React.setState()'
	function mockUseState<S>(
		initialState: S | (() => S),
	): [S, React.Dispatch<React.SetStateAction<S>>] {
		return [
			typeof initialState == "function" ? (initialState as () => S)() : initialState,
			() => {},
		];
	}

	// Mock 'React.useEffect()'
	function mockUseEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {}

	let sandbox: SinonSandbox;

	before(() => {
		sandbox = createSandbox();
	});

	beforeEach(() => {
		sandbox.stub(React, "useState").callsFake(mockUseState as any);
		sandbox.stub(React, "useEffect").callsFake(mockUseEffect);
	});

	afterEach(() => {
		sandbox.restore();
	});

	it("works", () => {
		const tree = createLocalTree("tree");

		const inventory = useTree<Inventory>(tree);

		assert.deepEqual(JSON.parse(JSON.stringify(inventory)), { nuts: 0, bolts: 0 });
	});
});
