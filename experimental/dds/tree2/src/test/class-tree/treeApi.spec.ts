/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import { nodeApi } from "../../class-tree/treeApi";
import { TreeFactory } from "../../treeFactory";
import { SchemaFactory, TreeConfiguration } from "../../class-tree";
import { createIdCompressor } from "../utils";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

const factory = new TreeFactory({});

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const root = tree.schematize(config).root;
		assert(nodeApi.is(root, Point));
		assert(root instanceof Point);
		assert(!nodeApi.is(root, schema.number));
		assert(!nodeApi.is(5, schema.number));
	});
});
