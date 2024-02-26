/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { nodeApi } from "../../simple-tree/treeApi.js";
import { TreeFactory } from "../../treeFactory.js";
import { SchemaFactory, Tree, TreeConfiguration } from "../../simple-tree/index.js";
import { rootFieldKey } from "../../core/index.js";
import { TreeStatus } from "../../feature-libraries/index.js";
import { getView } from "./utils.js";

const schema = new SchemaFactory("com.example");

class Point extends schema.object("Point", {}) {}

const factory = new TreeFactory({});

describe("treeApi", () => {
	it("is", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
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

	it("`is` can narrow polymorphic leaf field content", () => {
		const config = new TreeConfiguration([schema.number, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, schema.number)) {
			const _check: number = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("`is` can narrow polymorphic combinations of value and objects", () => {
		const config = new TreeConfiguration([Point, schema.string], () => "x");
		const root = getView(config).root;

		if (Tree.is(root, Point)) {
			const _check: Point = root;
			assert.fail();
		} else {
			const value: string = root;
			assert.equal(value, "x");
		}
	});

	it("schema", () => {
		const config = new TreeConfiguration([Point, schema.number], () => ({}));
		const root = getView(config).root;
		assert.equal(nodeApi.schema(root), Point);
		assert.equal(nodeApi.schema(5), schema.number);
	});
	it("key", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(nodeApi.key(root), rootFieldKey);
		assert.equal(nodeApi.key(root[0]), 0);
		assert.equal(nodeApi.key(root[1]), 1);
		assert.equal(nodeApi.key(root[1].x), "x");
	});

	it("parent", () => {
		class Child extends schema.object("Child", { x: Point }) {}
		const Root = schema.array(Child);
		const config = new TreeConfiguration(Root, () => [{ x: {} }, { x: {} }]);
		const root = getView(config).root;
		assert.equal(nodeApi.parent(root), undefined);
		assert.equal(nodeApi.parent(root[0]), root);
		assert.equal(nodeApi.parent(root[1]), root);
		assert.equal(nodeApi.parent(root[1].x), root[1]);
	});

	it("treeStatus", () => {
		class Root extends schema.object("Root", { x: Point }) {}
		const config = new TreeConfiguration(Root, () => ({ x: {} }));
		const root = getView(config).root;
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

	// TODO: event tests to replace ones in src/test/simple-tree/node.spec.ts, and provide better coverage.
});
