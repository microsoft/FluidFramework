/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { createIdCompressor } from "@fluidframework/id-compressor";
// eslint-disable-next-line import/no-internal-modules
import { nodeApi } from "../../class-tree/treeApi";
import { TreeFactory } from "../../treeFactory";
import { SchemaFactory, TreeConfiguration } from "../../class-tree";
import { rootFieldKey } from "../../core";
import { TreeStatus } from "../../feature-libraries";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

const factory = new TreeFactory({});

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const tree = factory.create(new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }), "tree");
		const root = tree.schematize(config).root;
		assert(nodeApi.is(root, Point));
		assert(root instanceof Point);
		assert(!nodeApi.is(root, schema.number));
		assert(nodeApi.is(5, schema.number));
		assert(!nodeApi.is(root, schema.number));
		assert(!nodeApi.is(5, Point));

		const NotInDocument = schema.object("never", {});
		// Using a schema that is not in the document throws:
		assert.throws(() => nodeApi.is(root, NotInDocument));
	});
	it("schema", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const tree = factory.create(new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }), "tree");
		const root = tree.schematize(config).root;
		assert.equal(nodeApi.schema(root), Point);
		assert.equal(nodeApi.schema(5), schema.number);
	});
	it("key", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const tree = factory.create(new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }), "tree");
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
		const tree = factory.create(new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }), "tree");
		const root = tree.schematize(config).root;
		assert.equal(nodeApi.parent(root), undefined);
		assert.equal(nodeApi.parent(root[0]), root);
		assert.equal(nodeApi.parent(root[1]), root);
		assert.equal(nodeApi.parent(root[1].x), root[1]);
	});

	it("treeStatus", () => {
		class Root extends schema.object("Root", { x: Point }) {}
		const config = new TreeConfiguration(Root, () => ({ x: {} }));
		const tree = factory.create(new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }), "tree");
		const root = tree.schematize(config).root;
		const child = root.x;
		const newChild = new Point({});
		assert.equal(nodeApi.status(root), TreeStatus.InDocument);
		assert.equal(nodeApi.status(child), TreeStatus.InDocument);
		// TODO: This API layer should have an Unhydrated status:
		// assert.equal(nodeApi.status(newChild), TreeStatus.Unhydrated);
		root.x = newChild;
		assert.equal(nodeApi.status(root), TreeStatus.InDocument);
		assert.equal(nodeApi.status(child), TreeStatus.Removed);
		assert.equal(nodeApi.status(newChild), TreeStatus.InDocument);
		// TODO: test Deleted status.
	});
});
