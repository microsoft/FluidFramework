/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { MockNodeKeyManager } from "../../feature-libraries/index.js";
import {
	SchematizingSimpleTreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizingTreeView.js";
import {
	cursorFromInsertable,
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
	type UnsafeUnknownSchema,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../simple-tree/toStoredSchema.js";
import {
	checkoutWithContent,
	createTestUndoRedoStacks,
	validateUsageError,
} from "../utils.js";
import { insert } from "../sequenceRootUtils.js";
import type { TreeCheckout, TreeStoredContent } from "../../shared-tree/index.js";
import { SchemaFactoryAlpha } from "../schemaFactoryAlpha.js";

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
	unhydratedInitialTree: InsertableField<UnsafeUnknownSchema>,
	nodeKeyManager = new MockNodeKeyManager(),
): TreeCheckout {
	const initialTree = cursorFromInsertable<UnsafeUnknownSchema>(
		viewConfig.schema,
		unhydratedInitialTree,
		nodeKeyManager,
	);
	const treeContent: TreeStoredContent = {
		schema: toStoredSchema(viewConfig.schema),
		initialTree,
	};
	return checkoutWithContent(treeContent);
}

// Schema for tree that must always be empty.
const emptySchema = toStoredSchema(schema.optional([]));

describe("SchematizingSimpleTreeView", () => {
	it("Initialize document", () => {
		const emptyContent = {
			schema: emptySchema,
			initialTree: undefined,
		};
		const checkout = checkoutWithContent(emptyContent);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		const { compatibility } = view;
		assert.equal(compatibility.canView, false);
		assert.equal(compatibility.canUpgrade, false);
		assert.equal(compatibility.canInitialize, true);

		view.initialize(5);
		assert.equal(view.root, 5);
	});

	it("Initialize errors", () => {
		const emptyContent = {
			schema: emptySchema,
			initialTree: undefined,
		};
		const checkout = checkoutWithContent(emptyContent);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

		assert.throws(() => view.root, validateUsageError(/compatibility/));

		assert.throws(() => view.upgradeSchema(), validateUsageError(/compatibility/));
		assert.throws(
			() => view.initialize(5),
			validateUsageError(/invalid state by another error/),
		);
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

	it("Schema becomes un-upgradeable then exact match again", () => {
		const checkout = checkoutWithInitialTree(config, 5);
		const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];
		view.events.on("schemaChanged", () => log.push(["schemaChanged", getChangeData(view)]));

		// Modify schema to invalidate view
		checkout.updateSchema(toStoredSchema([schema.number, schema.string]));

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
		view.breaker.clearError();
		// Modify schema to be compatible again
		checkout.updateSchema(toStoredSchema([schema.number]));
		assert.equal(view.compatibility.isEquivalent, true);
		assert.equal(view.compatibility.canUpgrade, true);
		assert.equal(view.compatibility.canView, true);

		assert.deepEqual(log, [["schemaChanged", 5]]);
		assert.equal(view.root, 5);
		view.dispose();
	});

	it("Open document whose stored schema has additional optional fields", () => {
		// This sort of scenario might be reasonably encountered when an "older" version of an application opens
		// up a document that has been created and/or edited by a "newer" version of an application (which has
		// expanded the schema to include more information).
		const factory = new SchemaFactoryAlpha(undefined);
		class PersonGeneralized extends factory.object("Person", {
			name: factory.string,
			age: factory.number,
			address: factory.optional(factory.string),
		}) {}
		class PersonSpecific extends factory.object(
			"Person",
			{
				name: factory.string,
				age: factory.number,
			},
			{ allowUnknownOptionalFields: true },
		) {}

		const personConfig = new TreeViewConfiguration({
			schema: PersonSpecific,
		});
		const personConfigGeneralied = new TreeViewConfiguration({
			schema: PersonGeneralized,
		});
		const checkout = checkoutWithInitialTree(
			personConfigGeneralied,
			new PersonGeneralized({ name: "Alice", age: 42, address: "123 Main St" }),
		);
		const viewSpecific = new SchematizingSimpleTreeView(
			checkout,
			personConfig,
			new MockNodeKeyManager(),
		);

		assert.deepEqual(viewSpecific.compatibility, {
			canView: true,
			canUpgrade: false,
			isEquivalent: false,
			canInitialize: false,
		});

		assert.equal(Object.keys(viewSpecific.root).length, 2);
		assert.equal(Object.entries(viewSpecific.root).length, 2);
		assert.equal(viewSpecific.root.name, "Alice");
		assert.equal(viewSpecific.root.age, 42);

		viewSpecific.dispose();
		const viewGeneralized = new SchematizingSimpleTreeView(
			checkout,
			personConfigGeneralied,
			new MockNodeKeyManager(),
		);
		assert.deepEqual(viewGeneralized.compatibility, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
			canInitialize: false,
		});
		assert.equal(Object.keys(viewGeneralized.root).length, 3);
		assert.equal(Object.entries(viewGeneralized.root).length, 3);
		assert.equal(viewGeneralized.root.name, "Alice");
		assert.equal(viewGeneralized.root.age, 42);
		assert.equal(viewGeneralized.root.address, "123 Main St");
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

	describe("events", () => {
		it("schemaChanged", () => {
			const content = {
				schema: toStoredSchema([]),
				initialTree: undefined,
			};
			const checkout = checkoutWithContent(content);
			const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());
			const log: string[] = [];
			view.events.on("schemaChanged", () => log.push("changed"));
			assert.deepEqual(log, []);
			view.upgradeSchema();
			assert.deepEqual(log, ["changed"]);
		});

		it("emits changed events for local edits", () => {
			const emptyContent = {
				schema: emptySchema,
				initialTree: undefined,
			};
			const checkout = checkoutWithContent(emptyContent);
			const view = new SchematizingSimpleTreeView(checkout, config, new MockNodeKeyManager());

			let localChanges = 0;

			const unsubscribe = view.events.on("changed", (data) => {
				if (data.isLocal) {
					localChanges++;
				}
			});

			insert(checkout, 0, "a");
			assert.equal(localChanges, 1);
			unsubscribe();
		});

		it("does not emit changed events for rebases", () => {
			const stringArraySchema = schema.array([schema.string]);
			const stringArrayStoredSchema = toStoredSchema(stringArraySchema);
			const stringArrayContent = {
				schema: stringArrayStoredSchema,
				initialTree: cursorFromInsertable(stringArraySchema, ["a", "b", "c"]),
			};
			const checkout = checkoutWithContent(stringArrayContent);
			const main = new SchematizingSimpleTreeView(
				checkout,
				new TreeViewConfiguration({ schema: stringArraySchema }),
				new MockNodeKeyManager(),
			);
			const branch = main.fork();
			const mainRoot = main.root;
			const branchRoot = branch.root;

			mainRoot.insertAt(0, "a");
			assert.deepEqual([...mainRoot], ["a", "a", "b", "c"]);

			let changes = 0;
			branch.events.on("changed", (data) => {
				changes++;
			});

			branch.rebaseOnto(main);
			assert.deepEqual([...branchRoot], ["a", "a", "b", "c"]);
			assert.equal(changes, 0);
		});
	});
});
