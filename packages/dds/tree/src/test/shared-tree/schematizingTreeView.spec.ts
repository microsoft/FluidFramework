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
import {
	SchematizingSimpleTreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizingTreeView.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { cursorFromUnhydratedRoot, toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import {
	checkoutWithContent,
	createTestUndoRedoStacks,
	insert,
	validateUsageError,
} from "../utils.js";
import type { TreeContent, TreeCheckout } from "../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");
const config = new TreeViewConfiguration({ schema: schema.number });
const configGeneralized = new TreeViewConfiguration({
	schema: [schema.number, schema.string],
});
const configGeneralized2 = new TreeViewConfiguration({
	schema: [schema.number, schema.boolean],
});

function checkoutWithInitialTree(
	viewConfig: TreeViewConfiguration,
	unhydratedInitialTree: InsertableTreeFieldFromImplicitField,
	nodeKeyManager = new MockNodeKeyManager(),
): TreeCheckout {
	const initialTree = cursorFromUnhydratedRoot(
		viewConfig.schema,
		unhydratedInitialTree,
		nodeKeyManager,
	);
	const treeContent: TreeContent = {
		schema: toFlexSchema(viewConfig.schema),
		initialTree,
	};
	return checkoutWithContent(treeContent);
}

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

		assert.throws(() => view.root, validateUsageError(/compatibility/));
		const { compatibility } = view;
		assert.equal(compatibility.canView, false);
		assert.equal(compatibility.canUpgrade, false);
		assert.equal(compatibility.canInitialize, true);

		assert.throws(() => view.upgradeSchema(), validateUsageError(/compatibility/));
		view.initialize(5);

		assert.equal(view.root, 5);
	});

	const getChangeData = <T extends ImplicitFieldSchema>(
		view: SchematizingSimpleTreeView<T>,
	) => {
		return view.compatibility.canView
			? view.root
			: `SchemaCompatibilityStatus canView: ${view.compatibility.canView} canUpgrade: ${view.compatibility.canUpgrade}`;
	};

	it("Open and close existing document", () => {
		const checkout = checkoutWithInitialTree(config, 5);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		assert.equal(view.compatibility.isEquivalent, true);
		const root = view.root;
		assert.equal(root, 5);
		const log: [string, unknown][] = [];
		const unsubscribe = view.events.on("schemaChanged", () =>
			log.push(["schemaChanged", getChangeData(view)]),
		);
		const unsubscribe2 = view.events.on("rootChanged", () =>
			log.push(["rootChanged", view.root]),
		);

		// Should be a no op since not in an error state;
		view.upgradeSchema();

		view.dispose();
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		unsubscribe();
		unsubscribe2();

		assert.deepEqual(log, []);
	});

	it("Modify root", () => {
		const checkout = checkoutWithInitialTree(config, 5);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		view.events.on("schemaChanged", () => log.push(["schemaChanged", getChangeData(view)]));
		view.events.on("rootChanged", () => log.push(["rootChanged", getChangeData(view)]));
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];

		view.root = 6;

		assert.deepEqual(log, [["rootChanged", 6]]);
	});

	// TODO: AB#8121: When adding support for additional optional fields, we may want a variant of this test which does the analogous flow using
	// an intermediate state where canView is true but canUpgrade is false.
	it("Schema becomes un-upgradeable then exact match again", () => {
		const checkout = checkoutWithInitialTree(config, 5);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];
		view.events.on("schemaChanged", () => log.push(["schemaChanged", getChangeData(view)]));

		// Modify schema to invalidate view
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number, schema.string])));

		assert.deepEqual(log, [
			["schemaChanged", "SchemaCompatibilityStatus canView: false canUpgrade: false"],
		]);
		log.length = 0;
		assert.equal(view.compatibility.isEquivalent, false);
		assert.equal(view.compatibility.canUpgrade, false);
		assert.equal(view.compatibility.canView, false);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);

		// Modify schema to be compatible again
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number])));
		assert.equal(view.compatibility.isEquivalent, true);
		assert.equal(view.compatibility.canUpgrade, true);
		assert.equal(view.compatibility.canView, true);

		assert.deepEqual(log, [["schemaChanged", 5]]);
		assert.equal(view.root, 5);
		view.dispose();
	});

	it("Open upgradable document, then upgrade schema", () => {
		const checkout = checkoutWithInitialTree(config, 5);
		const view = new SchematizingSimpleTreeView(
			checkout,
			configGeneralized,
			new MockNodeKeyManager(),
		);
		const log: [string, unknown][] = [];
		view.events.on("rootChanged", () => log.push(["rootChanged", getChangeData(view)]));

		assert.equal(view.compatibility.canView, false);
		assert.equal(view.compatibility.canUpgrade, true);
		assert.equal(view.compatibility.isEquivalent, false);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		view.upgradeSchema();

		assert.deepEqual(log, [["rootChanged", 5]]);

		assert.equal(view.compatibility.isEquivalent, true);
		assert.equal(view.root, 5);
	});

	it("Attempt to open document using view schema that is incompatible due to being too strict compared to the stored schema", () => {
		const checkout = checkoutWithInitialTree(configGeneralized, 6);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		assert.equal(view.compatibility.canView, false);
		assert.equal(view.compatibility.canUpgrade, false);
		assert.equal(view.compatibility.isEquivalent, false);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);
	});

	it("Open incompatible document", () => {
		const checkout = checkoutWithInitialTree(configGeneralized, 6);
		const view = new SchematizingSimpleTreeView(
			checkout,
			configGeneralized2,
			new MockNodeKeyManager(),
		);

		assert.equal(view.compatibility.canView, false);
		assert.equal(view.compatibility.canUpgrade, false);
		assert.equal(view.compatibility.isEquivalent, false);
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

	// AB#8200: This test may not be necessary with the schematize API removed.
	it("handles proxies in the initial tree", () => {
		// This is a regression test for a bug in which the initial tree contained a proxy and subsequent reads of the tree would mix up the proxy associations.
		const sf = new SchemaFactory(undefined);
		class TestObject extends sf.object("TestObject", { value: sf.number }) {}
		const viewConfig = new TreeViewConfiguration({ schema: TestObject });
		const nodeKeyManager = new MockNodeKeyManager();
		const view = new SchematizingSimpleTreeView(
			checkoutWithInitialTree(viewConfig, new TestObject({ value: 3 }), nodeKeyManager),
			viewConfig,
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
