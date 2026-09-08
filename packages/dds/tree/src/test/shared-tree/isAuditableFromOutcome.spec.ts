/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { createIndependentTreeAlpha } from "@fluidframework/tree/alpha";

// #region Internal production imports
import type { CodecWriteOptions } from "../../codec/index.js";
import { currentVersion } from "../../codec/index.js";
import type { TreeStoredSchema } from "../../core/index.js";
import { rootFieldKey } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { forbidden } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import type { ModularChangeset, SchemaChange } from "../../feature-libraries/index.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	fieldKinds,
} from "../../feature-libraries/index.js";
import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { isAuditableFromOutcome } from "../../shared-tree/isAuditableFromOutcome.js";
import type {
	SharedTreeChange,
	SharedTreeInnerChange,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeTypes.js";
// #endregion
// #region Test imports
import { ajvValidator } from "../codec/index.js";
import {
	TestTreeProviderLite,
	chunkFromJsonTrees,
	failCodecFamily,
	getView,
	mintRevisionTag,
} from "../utils.js";
// #endregion

describe("isAuditableFromOutcome", () => {
	describe("using explicit SharedTreeChange constructs", () => {
		const codecOptions = {
			jsonValidator: ajvValidator,
			minVersionForCollab: currentVersion,
		} as const satisfies CodecWriteOptions;
		const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily, codecOptions);
		const dataChanges: ModularChangeset[] = [];
		const editor = new DefaultEditBuilder(
			modularFamily,
			mintRevisionTag,
			(taggedChange) => dataChanges.push(taggedChange.change),
			codecOptions,
		);

		const rootField = { parent: undefined, field: rootFieldKey };
		editor.valueField(rootField).set(chunkFromJsonTrees(["X"]));
		editor.valueField(rootField).set(chunkFromJsonTrees(["Y"]));

		const dataChangeA = dataChanges[0];
		const dataChangeB = dataChanges[1];

		const emptySchema = {
			nodeSchema: new Map(),
			rootFieldSchema: {
				kind: forbidden.identifier,
				types: new Set(),
				persistedMetadata: undefined,
			},
		} as const satisfies TreeStoredSchema;
		const innerSchemaChange = {
			schema: { new: emptySchema, old: emptySchema },
			isInverse: false,
		} as const satisfies SchemaChange;

		const dataInner = (change: ModularChangeset): SharedTreeInnerChange => ({
			type: "data",
			innerChange: change,
		});
		const schemaInner = {
			type: "schema",
			innerChange: innerSchemaChange,
		} as const satisfies SharedTreeInnerChange;

		it("returns true for an empty change", () => {
			const change = { changes: [] } as const satisfies SharedTreeChange;
			assert.equal(isAuditableFromOutcome(change), true);
		});

		it("returns true for a single data change with no violated constraints", () => {
			const change = { changes: [dataInner(dataChangeA)] } as const satisfies SharedTreeChange;
			assert.equal(isAuditableFromOutcome(change), true);
		});

		it("returns true when a data change has constraintViolationCount explicitly 0", () => {
			const change = {
				changes: [dataInner({ ...dataChangeA, constraintViolationCount: 0 })],
			} as const satisfies SharedTreeChange;
			assert.equal(isAuditableFromOutcome(change), true);
		});

		it("returns false when the change contains more than one inner change", () => {
			const change = {
				changes: [dataInner(dataChangeA), dataInner(dataChangeB)],
			} as const satisfies SharedTreeChange;
			assert.equal(isAuditableFromOutcome(change), false);
		});

		it("returns false for a single schema change", () => {
			const change: SharedTreeChange = { changes: [schemaInner] };
			assert.equal(isAuditableFromOutcome(change), false);
		});

		// Note: the types of changes are not discriminated in the implementation,
		// so one being schema change does not matter.
		it("returns false when the change contains a schema change interleaved with a data change", () => {
			const change: SharedTreeChange = {
				changes: [dataInner(dataChangeA), schemaInner],
			};
			assert.equal(isAuditableFromOutcome(change), false);
		});

		it("returns false when a single data change has violated constraints", () => {
			const change: SharedTreeChange = {
				changes: [dataInner({ ...dataChangeA, constraintViolationCount: 1 })],
			};
			assert.equal(isAuditableFromOutcome(change), false);
		});
	});

	describe("using production edits", () => {
		it("auditable: a simple field insert produces a single data change with no violated constraints", () => {
			// Setup
			// Public actions
			const sf = new SchemaFactory("audit-prod-data");
			class Item extends sf.object("Item", { id: sf.string }) {}
			const ItemArray = sf.array(Item);
			const view = getView(
				new TreeViewConfiguration({ schema: ItemArray, enableSchemaValidation: true }),
			);
			view.initialize([]);
			view.root.insertAtEnd({ id: "A" });

			// Begin internal access
			const change = view.checkout.mainBranch.getHead().change;
			// Confirm expected SharedTreeChange shape
			assert.equal(change.changes.length, 1);
			const inner = change.changes[0];
			assert.equal(inner.type, "data");
			// constraintViolationCount must be 0 or undefined
			assert.equal(inner.innerChange.constraintViolationCount ?? 0, 0);

			// Act and Verify
			assert.equal(isAuditableFromOutcome(change), true);
		});

		it("not auditable: a single schema upgrade (produces a single schema inner change)", () => {
			// Setup
			// Public actions
			const sf = new SchemaFactory("audit-prod-schema");
			const InitialField = sf.optional(sf.string);
			const ExpandedField = sf.optional([sf.string, sf.number]);

			const tree = createIndependentTreeAlpha();
			const initialView = tree.viewWith(new TreeViewConfiguration({ schema: InitialField }));
			initialView.initialize(undefined);
			initialView.dispose();

			const view = tree.viewWith(
				new TreeViewConfiguration({
					schema: ExpandedField,
					enableSchemaValidation: true,
				}),
			);
			view.upgradeSchema();

			// Begin internal access
			const checkout = (view as SchematizingSimpleTreeView<typeof ExpandedField>).checkout;
			const change = checkout.mainBranch.getHead().change;
			// Confirm expected SharedTreeChange shape
			assert.equal(change.changes.length, 1);
			assert.equal(change.changes[0].type, "schema");

			// Act and Verify
			assert.equal(isAuditableFromOutcome(change), false);
		});

		it("not auditable: a transaction combining a data edit with a schema upgrade (contains more than one data inner change)", () => {
			// Setup
			// Public actions
			const sf = new SchemaFactory("audit-prod-multi");
			const InitialField = sf.optional(sf.string);
			const ExpandedField = sf.optional([sf.string, sf.number]);

			const tree = createIndependentTreeAlpha();
			const initialView = tree.viewWith(new TreeViewConfiguration({ schema: InitialField }));
			initialView.initialize(undefined);
			initialView.dispose();

			const view = tree.viewWith(
				new TreeViewConfiguration({
					schema: ExpandedField,
					enableSchemaValidation: true,
				}),
			);

			// Begin internal access
			const checkout = (view as SchematizingSimpleTreeView<typeof ExpandedField>).checkout;

			// Compose a schema upgrade and a data edit into a single commit via a transaction.
			// The schema must be upgraded first because the view's typed setter requires the
			// stored schema to match the view's schema.
			checkout.runTransaction(() => {
				view.upgradeSchema();
				view.root = 2;
			});

			const change = checkout.mainBranch.getHead().change;
			// Confirm expected SharedTreeChange shape: more than one inner change
			assert(change.changes.length > 1);
			// Expectations that are not critical
			assert(change.changes.some((c) => c.type === "schema"));
			assert(change.changes.some((c) => c.type === "data"));

			// Act and Verify
			assert.equal(isAuditableFromOutcome(change), false);
		});

		it("not auditable: a concurrent edit invalidates a nodeInDocument precondition (violated constraints)", () => {
			// Setup
			const sf = new SchemaFactory("audit-prod-constraint");
			class Child extends sf.object("Child", { value: sf.number }) {}
			class Parent extends sf.object("Parent", {
				content: sf.number,
				child: sf.optional(Child),
			}) {}

			const config = new TreeViewConfiguration({
				schema: Parent,
				enableSchemaValidation: true,
			});

			const provider = new TestTreeProviderLite(2);
			const viewA = provider.trees[0].kernel.viewWith(config);
			const viewB = provider.trees[1].kernel.viewWith(config);

			viewA.initialize({ content: 1, child: { value: 1 } });
			provider.synchronizeMessages();

			// Tree A removes the child node. Because submission order is sequencing order,
			// this lands before Tree B's transaction below.
			viewA.root.child = undefined;

			// Tree B authors a transaction whose precondition depends on the (locally still
			// present) child node.
			const childB = viewB.root.child;
			assert(childB !== undefined);
			viewB.runTransaction(
				() => {
					viewB.root.content = 2;
				},
				{ preconditions: [{ type: "nodeInDocument", node: childB }] },
			);

			// After sequencing, Tree A's removal lands first, which invalidates the
			// precondition on Tree B's rebased commit.
			provider.synchronizeMessages();

			// Confirm expected SharedTreeChange shape
			const change = viewB.checkout.mainBranch.getHead().change;
			assert.equal(change.changes.length, 1);
			const inner = change.changes[0];
			assert.equal(inner.type, "data");
			assert.equal(inner.innerChange.constraintViolationCount, 1);

			// Act and Verify
			assert.equal(isAuditableFromOutcome(change), false);
		});
	});
});
