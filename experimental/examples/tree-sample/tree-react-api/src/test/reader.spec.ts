/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTreeFactory } from "@fluid-internal/tree";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { api } from "../api";
import { Schema } from "../schema";

describe("reader", () => {
	function createLocalTree(id: string) {
		const factory = new SharedTreeFactory();
		const tree = factory.create(new MockFluidDataStoreRuntime(), id);

		api(tree, new Schema());
	}

	it("works", () => {
		createLocalTree("tree");
	});
});
