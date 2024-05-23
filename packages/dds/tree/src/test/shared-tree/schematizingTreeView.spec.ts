/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	FieldKinds,
	FlexFieldSchema,
	intoStoredSchema,
	MockNodeKeyManager,
	SchemaBuilderBase,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { UpdateType } from "../../shared-tree/schematizeTree.js";
import {
	SchematizeError,
	SchematizingSimpleTreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizingTreeView.js";
import { SchemaFactory, TreeConfiguration } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexConfig, toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { disposeSymbol } from "../../util/index.js";
import { checkoutWithContent, createTestUndoRedoStacks, insert } from "../utils.js";

const schema = new SchemaFactory("com.example");
const config = new TreeConfiguration(schema.number, () => 5);
const configGeneralized = new TreeConfiguration([schema.number, schema.string], () => 6);
const flexConfig = toFlexConfig(config, new MockNodeKeyManager());
const flexConfigGeneralized = toFlexConfig(configGeneralized, new MockNodeKeyManager());

// Schema for tree that must always be empty.
const emptySchema = new SchemaBuilderBase(FieldKinds.required, {
	scope: "Empty",
	lint: {
		rejectEmpty: false,
		rejectForbidden: false,
	},
}).intoSchema(FlexFieldSchema.empty);

describe("SchematizingSimpleTreeView", () => {
	it("Initialize document", () => {
		const emptyContent = {
			schema: emptySchema,
			initialTree: undefined,
		};
		const checkout = checkoutWithContent(emptyContent);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === true);
		assert(error.canUpgrade === true);
		assert(error.updateType === UpdateType.Initialize);

		view.upgradeSchema();
		assert.equal(view.root, 5);
	});

	it("Open and close existing document", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		assert.equal(view.error, undefined);
		const root = view.root;
		assert.equal(root, 5);
		const log: [string, unknown][] = [];
		const unsubscribe = view.events.on("rootChanged", () =>
			log.push(["rootChanged", view.error ?? view.root]),
		);
		const unsubscribe2 = view.events.on("afterBatch", () =>
			log.push(["afterBatch", view.root]),
		);

		// Should be a no op since not in an error state;
		view.upgradeSchema();

		view[disposeSymbol]();
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		unsubscribe();
		unsubscribe2();

		assert.deepEqual(log, []);
	});

	it("Modify root", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));
		view.events.on("afterBatch", () => log.push(["afterBatch", view.root]));
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];

		view.root = 6;

		assert.deepEqual(log, [
			["rootChanged", 6],
			["afterBatch", 6],
		]);
	});

	it("Schema becomes incompatible then comparable", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));

		// Modify schema to invalidate view
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number, schema.string])));

		// typecast is needed here to remove narrowing from previous assert.
		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert.deepEqual(log, [["rootChanged", error]]);
		log.length = 0;
		assert(error.canInitialize === false);
		assert(error.canUpgrade === false);
		assert(error.updateType === UpdateType.Incompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);

		// Modify schema to be compatible again
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number])));
		assert.deepEqual(log, [["rootChanged", 5]]);
		assert.equal(view.root, 5);
		view[disposeSymbol]();
	});

	it("Open upgradable document, then upgrade schema", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(
			checkout,
			configGeneralized,
			new MockNodeKeyManager(),
		);
		const log: [string, unknown][] = [];
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === false);
		assert(error.canUpgrade === true);
		assert(error.updateType === UpdateType.SchemaCompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		view.upgradeSchema();

		assert.deepEqual(log, [["rootChanged", 5]]);

		assert.equal(view.error, undefined);
		assert.equal(view.root, 5);
	});

	it("Open incompatible document", () => {
		const checkout = checkoutWithContent(flexConfigGeneralized);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === false);
		assert(error.canUpgrade === false);
		assert(error.updateType === UpdateType.Incompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);
	});

	it("supports revertibles", () => {
		const emptyContent = {
			schema: emptySchema,
			initialTree: undefined,
		};
		const checkout = checkoutWithContent(emptyContent);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		const { undoStack, redoStack } = createTestUndoRedoStacks(view.events);

		insert(checkout, 0, "a");
		assert.equal(undoStack.length, 1);
		assert.equal(redoStack.length, 0);

		undoStack.pop()?.revert();
		assert.equal(undoStack.length, 0);
		assert.equal(redoStack.length, 1);
	});

	it("handles proxies in the initial tree", () => {
		// This is a regression test for a bug in which the initial tree contained a proxy and subsequent reads of the tree would mix up the proxy associations.
		const sf = new SchemaFactory(undefined);
		class TestObject extends sf.object("TestObject", { value: sf.number }) {}
		const treeContent = new TreeConfiguration(TestObject, () => new TestObject({ value: 3 }));
		const nodeKeyManager = new MockNodeKeyManager();
		const view = new SchematizingSimpleTreeView(
			checkoutWithContent(toFlexConfig(treeContent, nodeKeyManager)),
			treeContent,
			nodeKeyManager,
		);

		// We do not call `upgradeSchema()` and thus the initial tree remains unused.
		// Therefore, the proxy for `new TestObject(...)` should not be bound.
		assert.equal(view.root.value, 3);
		// In the buggy case, the proxy for `new TestObject(...)` would get bound during this set, which is wrong...
		view.root.value = 4;
		// ...and would cause this read to return a proxy to the TestObject rather than the primitive value.
		assert.equal(view.root.value, 4);
	});
});
