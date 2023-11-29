/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AllowedUpdateType,
	ForestType,
	TypedTreeFactory,
	typeboxValidator,
} from "@fluid-experimental/tree2";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import React from "react";
import { SinonSandbox, createSandbox } from "sinon";
import { Inventory, schema } from "./schema";

// TODO: why do failing tests in this suite not cause CI to fail?
describe("useTree()", () => {
	function createLocalTree(id: string): Inventory {
		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,

			subtype: "InventoryList",
		});
		const tree = factory.create(new MockFluidDataStoreRuntime(), id);
		return tree.schematizeOld({
			initialTree: {
				nuts: 0,
				bolts: 0,
			},
			allowedSchemaModifications: AllowedUpdateType.None,
			schema,
		}).root;
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

	// Mock 'React.useMemo()'
	function mockUseMemo<T>(factory: () => T, deps: React.DependencyList | undefined): T {
		return factory();
	}

	let sandbox: SinonSandbox;

	before(() => {
		sandbox = createSandbox();
	});

	beforeEach(() => {
		sandbox.stub(React, "useState").callsFake(mockUseState as any);
		sandbox.stub(React, "useEffect").callsFake(mockUseEffect);
		sandbox.stub(React, "useMemo").callsFake(mockUseMemo);
	});

	afterEach(() => {
		sandbox.restore();
	});

	it("works", () => {
		const tree = createLocalTree("tree");
		// TODO test use functions
		assert.deepEqual(JSON.parse(JSON.stringify(tree)), {
			nuts: 0,
			bolts: 0,
		});
	});
});
