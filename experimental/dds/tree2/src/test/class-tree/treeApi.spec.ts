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
import { rootFieldKey } from "../../core";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

const factory = new TreeFactory({});

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const root = tree.schematize(config).root;
		assert(nodeApi.is(root, Point));
		assert(root instanceof Point);
		assert(!nodeApi.is(root, schema.number));
		assert(nodeApi.is(5, schema.number));
		assert(!nodeApi.is(root, schema.number));
		assert(!nodeApi.is(5, Point));
	});
	it("schema", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const root = tree.schematize(config).root;
		assert.equal(nodeApi.schema(root), Point);
		assert.equal(nodeApi.schema(5), schema.number);
	});
	it("key", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const root = tree.schematize(config).root;
		assert.equal(nodeApi.key(root), rootFieldKey);
		assert.equal(nodeApi.key(root[0]), 0);
		assert.equal(nodeApi.key(root[1]), 1);
		assert.equal(nodeApi.key(root[1].x), "x");
	});

	it("parent", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const root = tree.schematize(config).root;
		assert.equal(nodeApi.parent(root), undefined);
		assert.equal(nodeApi.parent(root[0]), root);
		assert.equal(nodeApi.parent(root[1]), root);
		assert.equal(nodeApi.parent(root[1].x), root[1]);
	});
});
