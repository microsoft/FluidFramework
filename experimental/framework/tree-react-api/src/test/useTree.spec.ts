/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AllowedUpdateType,
	ISharedTreeView,
	SchemaAware,
	SharedTreeFactory,
} from "@fluid-experimental/tree2";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import React from "react";
import { SinonSandbox, createSandbox } from "sinon";
import { useTree } from "..";
import { rootField, schema } from "./schema";

// TODO: why do failing tests in this suite not cause CI to fail?
describe("useTree()", () => {
	function createLocalTree(id: string): ISharedTreeView {
		const factory = new SharedTreeFactory();
		const tree = factory.create(new MockFluidDataStoreRuntime(), id);
		return tree.view;
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
		const root: SchemaAware.TypedField<typeof rootField> = useTree(tree, {
			schema,
			initialTree: {
				nuts: 0,
				bolts: 0,
			},
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
		});

		assert.deepEqual(JSON.parse(JSON.stringify(root[0])), { nuts: 0, bolts: 0 });
	});
});
