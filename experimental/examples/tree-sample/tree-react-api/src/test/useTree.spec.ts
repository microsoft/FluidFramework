/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AllowedUpdateType, ISharedTreeView, SharedTreeFactory } from "@fluid-internal/tree";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import React from "react";
import { SinonSandbox, createSandbox } from "sinon";
import { useTree } from "..";
import { schema, Inventory } from "./schema";

describe("useTree()", () => {
	function createLocalTree(id: string): ISharedTreeView {
		const factory = new SharedTreeFactory();
		const tree = factory.create(new MockFluidDataStoreRuntime(), id);
		const treeView: ISharedTreeView = tree.schematize({
			schema,
			initialTree: {
				nuts: 0,
				bolts: 0,
			},
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
		});
		return treeView;
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
