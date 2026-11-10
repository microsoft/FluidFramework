/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../../api.js";
import { EmptyKey, moveToDetachedField, storedEmptyFieldSchema } from "../../../core/index.js";
import {
	defaultSchemaPolicy,
	jsonableTreeFromFieldCursor,
} from "../../../feature-libraries/index.js";
import { TreeBeta } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getDiscrepanciesInAllowedContent } from "../../../simple-tree/api/discrepancies.js";
import {
	checkSchemaCompatibility,
	type ImplicitFieldSchema,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	type TreeView,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	schemaStatics,
	toUpgradeSchema,
} from "../../../simple-tree/index.js";
import { expectSchemaEqual, TestSchemaRepository, TestTreeProviderLite } from "../../utils.js";

/**
 * Asserts that two numeric enum values are equal.
 *
 * @typeParam TEnum - The enum object type with numeric keys that map values to member names.
 * @param enumObject - The enum object used to include member names in failure messages.
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 */
function assertEnumEqual<TEnum extends { [key: number]: string }>(
	enumObject: TEnum,
	a: number,
	b: number,
): void {
	if (a !== b) {
		assert.fail(`expected ${a} (${enumObject[a]}) to equal ${b} (${enumObject[b]})`);
	}
}

describe("Schema Evolution Examples", () => {
	// Shared schema factory used by the tests in this suite.
	const factory = new SchemaFactoryAlpha("test");

	/**
	 * Verifies that an explicit schema upgrade makes no observable change.
	 *
	 * @typeParam TSchema - The root schema of the view being checked.
	 * @param provider - Connects the clients and processes any operations submitted by the upgrade.
	 * @param view - A readable view whose upgrade is expected to succeed without changing the document.
	 *
	 * @remarks
	 * Synchronize all pending operations before calling this helper.
	 * Otherwise, an earlier operation could advance the sequence number during this check.
	 * The helper requests an upgrade and synchronizes the clients.
	 * It verifies that no schema-change event occurs, no operation is sequenced, and the root object is unchanged.
	 * Its temporary event listener is removed even if a check fails.
	 */
	function verifyNoOpUpgrade<TSchema extends ImplicitFieldSchema>(
		provider: TestTreeProviderLite,
		view: TreeView<TSchema>,
	): void {
		// Applications may request an upgrade even when none is needed; the request must remain permitted.
		assert.equal(view.compatibility.canUpgrade, true);

		const rootBeforeUpgrade = view.root;
		const sequenceNumber = provider.sequenceNumber;
		let schemaChanges = 0;
		const unsubscribe = view.events.on("schemaChanged", () => schemaChanges++);
		try {
			view.upgradeSchema();
			provider.synchronizeMessages();

			// A no-op must not tell the application to refresh its schema-dependent state.
			assert.equal(schemaChanges, 0);

			// With no earlier operations pending, an unchanged sequence number means no new operation was sequenced.
			assert.equal(provider.sequenceNumber, sequenceNumber);

			// Application references to the root must remain usable without obtaining a replacement node.
			assert.equal(view.root, rootBeforeUpgrade);
		} finally {
			unsubscribe();
		}
	}

	/**
	 * Verifies that an incompatible view cannot upgrade any local or synchronized document state.
	 *
	 * @typeParam TSchema - The incompatible view's root schema.
	 * @param provider - Synchronized clients with no pending operations.
	 * @param view - The view whose upgrade must be rejected.
	 *
	 * @remarks
	 * Captures stored data independently of the view so unknown fields are included.
	 * The rejected call breaks the requesting view; do not use that view or its checkout's public APIs afterward.
	 */
	function verifyRejectedUpgrade<TSchema extends ImplicitFieldSchema>(
		provider: TestTreeProviderLite,
		view: TreeView<TSchema>,
	): void {
		assert.equal(view.compatibility.canView, false);
		assert.equal(view.compatibility.canUpgrade, false);
		const sequenceNumber = provider.sequenceNumber;
		const snapshots = provider.trees.map((tree) => {
			const forest = tree.kernel.checkout.forest;

			// Open cursors before rejection: the expected error prevents allocating new cursors afterward.
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			return {
				tree,
				cursor,
				schema: tree.kernel.checkout.storedSchema.clone(),
				content: jsonableTreeFromFieldCursor(cursor),
			};
		});
		try {
			assert.throws(() => view.upgradeSchema(), validateUsageError(/cannot be upgraded/));
			provider.synchronizeMessages();

			// Rejecting an incompatible application version must not publish an operation or change either client's document.
			assert.equal(provider.sequenceNumber, sequenceNumber);
			for (const { tree, cursor, schema, content } of snapshots) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, schema);
				assert.deepEqual(jsonableTreeFromFieldCursor(cursor), content);
			}
		} finally {
			for (const { cursor } of snapshots) {
				cursor.free();
			}
		}
	}

	/**
	 * This shows basic usage of stored and view schema, including a schema change handled using the
	 * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
	 * Note that this focuses on simpler compatible cases
	 * (where old data meets the new schema and the schema is updated keeping the same identifier),
	 * and does only briefly mentions the case where a new identifier is needed
	 * (since adapters are not implemented yet, and they are the nice way to handle that).
	 */
	it("basic usage", () => {
		const codePoint = factory.objectAlpha("Primitive.CodePoint", {
			[EmptyKey]: factory.number,
		});

		// String made of unicode code points, allowing for sequence editing of a string.
		const text = factory.arrayAlpha("Text", codePoint);

		const point = factory.objectAlpha("Point", {
			x: factory.number,
			y: factory.number,
		});

		// A type that can be used to position items without an inherent position within the canvas.
		const positionedCanvasItem = factory.objectAlpha("PositionedCanvasItem", {
			position: point,
			content: text,
		});
		const canvas = factory.arrayAlpha("Canvas", positionedCanvasItem);

		const root = factory.required(canvas);

		const tolerantRoot = factory.optional(canvas);

		// Compose all the view information together.
		const viewSchema = new TreeViewConfigurationAlpha({ schema: root });

		// Now lets imagine using this application on a new empty document.
		// TreeStoredSchemaRepository defaults to a state that permits no document states at all.
		// To permit an empty document, we have to define a root field, and permit it to be empty.
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		{
			// When we open this document, we should check it's compatibility with our application:
			const compat = checkSchemaCompatibility(viewSchema, stored);

			// Sadly for our application, we did not allow empty roots in our view schema,
			// nor did we provide an adapter capable of handling empty roots.
			// This means our application is unable to view this document.
			// And since the view schema currently excludes empty roots, its also incompatible for upgrading:
			assert.equal(compat.canView, false);
			assert.equal(compat.canUpgrade, false);
			assert.deepEqual(compat.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: "root",
					view: ["test.Canvas"],
					stored: [],
				},
				{
					mismatch: "fieldKind",
					location: "root",
					view: "Value",
					stored: "Forbidden",
				},
			]);
			assert.deepEqual(compat.enabledUpgrades, new Map());

			// This is where the app would inform the user that the document
			// is not compatible with their version of the application.
			// This situation (view schema expecting a value where stored schema does not have one),
			// applies just the same in non-root cases, and thus the resolutions apply would also apply to other cases.
		}

		{
			// There are two ways the app could add support for handling empty documents.
			// 1. By adjusting it's view schema for the root field to tolerate empty (by making it optional).
			// 2. By providing a MissingFieldAdapter adapter for the root field
			//    (ex: by providing a default empty canvas).

			// This example picks the first approach.
			// Lets simulate the developers of the app making this change by modifying the view schema:
			const viewSchema2 = new TreeViewConfigurationAlpha({ schema: tolerantRoot });
			// When we open this document, we should check it's compatibility with our application:
			const compat = checkSchemaCompatibility(viewSchema2, stored);

			// The adjusted view schema can be used read this document, no adapters needed.
			assert.equal(compat.canUpgrade, true);

			// However the document just has its empty root schema,
			// so the app could make changes that could not be written back.
			assert.equal(compat.canView, false);

			// The app can consider this compatible and proceed if it is ok with updating schema on write.
			// There are a few approaches apps might want to take here, but we will assume one that seems reasonable:
			// If this were a document that that the app just created,
			// it can imminently write its schema into the document:
			// it knows there are no existing users of this document that will be broken by this.
			// But if this is a document that it did not just create,
			// it could inform the user that this document is supported for import,
			// but its format may be updated when saving,
			// and let the user choose if they want to open it readonly on read-write.
			// A web application might want to have a table of well know format updates that it considers ok to do
			// implicitly to avoid prompting the user if the change is a well understood forward version migration
			// to a widely supported version.

			// Lets assume its time to update the schema in the document
			// (either eagerly or lazily when first needing to do so when writing into the document).
			// Once again the order does not matter:
			assert(stored.tryUpdateTreeSchema(canvas));
			assert(stored.tryUpdateTreeSchema(schemaStatics.number));
			assert(stored.tryUpdateTreeSchema(point));
			assert(stored.tryUpdateTreeSchema(positionedCanvasItem));
			assert(stored.tryUpdateTreeSchema(text));
			assert(stored.tryUpdateTreeSchema(codePoint));
			assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(tolerantRoot).rootFieldSchema));
			// That will cause the document stored schema to change,
			// which will notify and applications with the document open.
			// They can recheck their compatibility:
			const compatNew = checkSchemaCompatibility(viewSchema2, stored);
			const report = [
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: tolerantRoot }),
					stored,
				),
			];
			assert.deepEqual(report, []);

			// It is now possible to write our date into the document.
			assert.equal(compatNew.canView, true);
			assert.equal(compatNew.canUpgrade, true);
			assert.equal(compatNew.discrepancies, undefined);
			assert.deepEqual(compatNew.enabledUpgrades, new Map());

			// Now lets imagine some time passes, and the developers want to add a second content type:

			const counter = factory.objectAlpha("Counter", {
				count: factory.number,
			});
			// Lets allow counters inside positionedCanvasItem, instead of just text:
			const positionedCanvasItem2 = factory.objectAlpha("PositionedCanvasItem", {
				position: point,
				content: [text, counter],
			});
			// And canvas is still the same storage wise, but its view schema references the updated positionedCanvasItem2:
			const canvas2 = factory.array("Canvas", positionedCanvasItem2);
			// Once again we will simulate reloading the app with different schema by modifying the view schema.
			const viewSchema3 = new TreeViewConfigurationAlpha({
				schema: factory.optional(canvas2),
			});

			// With this new schema, we can load the document just like before:
			const compat2 = checkSchemaCompatibility(viewSchema3, stored);
			assert.equal(compat2.canView, false);
			assert.equal(compat2.canUpgrade, true);
			assert.deepEqual(compat2.discrepancies, [
				{
					mismatch: "allowedTypes",
					location: {
						nodeType: "test.PositionedCanvasItem",
						fieldKey: "content",
					},
					view: ["test.Counter"],
					stored: [],
				},
			]);
			assert.deepEqual(compat2.enabledUpgrades, new Map());

			// This is the same case as above where we can choose to do a schema update if we want:
			assert(stored.tryUpdateTreeSchema(positionedCanvasItem2));
			assert(stored.tryUpdateTreeSchema(counter));

			// And recheck compat:
			const compat3 = checkSchemaCompatibility(viewSchema3, stored);
			assert.equal(compat3.canView, true);
			assert.equal(compat3.canUpgrade, true);
			assert.equal(compat3.discrepancies, undefined);
			assert.deepEqual(compat3.enabledUpgrades, new Map());
		}
	});

	describe("Staged allowed types", () => {
		/**
		 * V1 permits numeric `priority`.
		 * V2 adds staged string support to `priority` without enabling it.
		 *
		 * Open a V1 document with V2 and create a separate document with V2's default policy (the staged type is not enabled).
		 * Both documents must remain numeric-only, and V1 and V2 must still collaborate on numeric values.
		 * Declaring support for a future type must not itself permit writes of that type.
		 */
		it("adds a staged type without enabling it in existing or new documents", () => {
			class TaskV1 extends factory.object("Task", { priority: factory.number }) {}
			const stagedString = factory.staged(factory.string);
			const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(stringUpgrade !== undefined);
			class TaskV2 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedString]),
			}) {}
			const provider = new TestTreeProviderLite(2);
			const [originalTree, stagedTree] = provider.trees;
			const original = originalTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			original.initialize({ priority: 1 });
			provider.synchronizeMessages();
			const staged = asAlpha(
				stagedTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
			);

			// V2 can edit the old document without widening its stored priority types.
			assert.equal(staged.compatibility.canView, true);
			assert.equal(staged.isStagedUpgradeEnabled(stringUpgrade), "disabled");
			verifyNoOpUpgrade(provider, staged);
			staged.root.priority = 2;
			provider.synchronizeMessages();
			assert.equal(original.root.priority, 2);
			original.root.priority = 3;
			provider.synchronizeMessages();
			assert.equal(staged.root.priority, 3);
			for (const tree of provider.trees) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV1));
			}

			// Initialization with the staged view also excludes strings until explicitly enabled.
			const freshProvider = new TestTreeProviderLite(1);
			const freshTree = freshProvider.trees[0];
			const fresh = freshTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 }));
			fresh.initialize({ priority: 4 });
			freshProvider.synchronizeMessages();
			expectSchemaEqual(freshTree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV1));
			verifyNoOpUpgrade(freshProvider, fresh);

			// These invalid writes can break their views, so perform them after all successful interactions.
			assert.throws(() => {
				staged.root.priority = "urgent";
			});
			assert.throws(() => {
				fresh.root.priority = "urgent";
			});
			original.dispose();
		});

		/**
		 * V1 permits numeric `priority` values.
		 * V2 adds staged string support to `priority` without enabling it.
		 * V3 removes the staged string alternative and adds an unrelated optional `label`.
		 *
		 * Upgrade the same V1 document through V2 and V3.
		 * Canceling an unused staged declaration must not prevent the `label` upgrade or numeric edits by earlier clients.
		 */
		it("cancels a staged type before enablement while making another schema change", () => {
			class TaskV1 extends factory.object("Task", { priority: factory.number }) {}
			class TaskV2 extends factory.object("Task", {
				priority: factory.types([factory.number, factory.staged(factory.string)]),
			}) {}
			class TaskV3 extends factory.object("Task", {
				priority: factory.number,
				label: factory.optional(factory.string),
			}) {}
			const provider = new TestTreeProviderLite(3);
			const [originalTree, stagedTree, canceledTree] = provider.trees;
			const original = originalTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			original.initialize({ priority: 1 });
			provider.synchronizeMessages();
			const staged = stagedTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
			assert.equal(staged.compatibility.canView, true);
			verifyNoOpUpgrade(provider, staged);

			// Strings were never stored as an allowed type. Only the missing label requires an upgrade.
			const canceled = canceledTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
			assert.equal(canceled.compatibility.canView, false);
			assert.equal(canceled.compatibility.canUpgrade, true);
			canceled.upgradeSchema();
			canceled.root.label = "Experiment canceled";
			canceled.root.priority = 2;
			provider.synchronizeMessages();
			assert.equal(original.root.priority, 2);
			assert.equal(staged.root.priority, 2);
			original.root.priority = 3;
			provider.synchronizeMessages();
			assert.equal(canceled.root.priority, 3);
			assert.equal(canceled.root.label, "Experiment canceled");
			for (const tree of provider.trees) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV3));
			}

			// Earlier views can use the new label as an unknown field, but upgrading with omitted fields remains unsupported.
			assert.equal(original.compatibility.canView, true);
			assert.equal(original.compatibility.canUpgrade, false);
			assert.equal(staged.compatibility.canView, true);
			assert.equal(staged.compatibility.canUpgrade, false);
			verifyNoOpUpgrade(provider, canceled);

			// A client that still declares the canceled staged alternative cannot write it into this document.
			assert.throws(() => {
				staged.root.priority = "urgent";
			});
			canceled.dispose();
			original.dispose();
		});

		/**
		 * V1 declares numeric `priority` values and a staged string alternative.
		 * V2 removes the staged string alternative from `priority` instead of merely disabling the feature flag.
		 *
		 * Create a numeric-only document with V1's default policy, then explicitly enable strings using the same view schema.
		 * Open the enabled V1 document with V2, testing both numeric and string `priority` values.
		 * V2 must reject the document even when its current `priority` is numeric: stored permissions outlive individual values.
		 * The failed upgrade must not remove string support or change the document.
		 */
		for (const priority of [1, "urgent"] as const) {
			it(`cannot remove a staged type after enablement (current value: "${typeof priority}")`, () => {
				const stagedString = factory.staged(factory.string);
				const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(stringUpgrade !== undefined);
				class TaskV1 extends factory.object("Task", {
					priority: factory.types([factory.number, stagedString]),
				}) {}
				class TaskV2 extends factory.object("Task", { priority: factory.number }) {}
				const provider = new TestTreeProviderLite(2);
				const [documentTree, readerTree] = provider.trees;
				const initial = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
				initial.initialize({ priority: 1 });
				provider.synchronizeMessages();
				initial.dispose();
				const enabled = asAlpha(
					documentTree.viewWith(
						new TreeViewConfigurationAlpha({
							schema: TaskV1,
							stagedUpgradePolicy:
								StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
						}),
					),
				);
				enabled.upgradeSchema();
				enabled.root.priority = priority;
				provider.synchronizeMessages();
				assert.equal(enabled.isStagedUpgradeEnabled(stringUpgrade), "enabled");

				// Unknown optional-field tolerance cannot hide an unsupported type in a field V2 still declares.
				const removed = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
				verifyRejectedUpgrade(provider, removed);
				assert.equal(enabled.root.priority, priority);
				enabled.dispose();
			});
		}

		/**
		 * V1 declares numeric `priority` values and a staged string alternative.
		 * V2 keeps the staged string alternative for `priority` and adds an optional `label`.
		 *
		 * Create a numeric-only document with V1's default policy, then enable strings and roll the feature flag back to the restrictive policy.
		 * Reopen the enabled document with the flag-off V1 view, then upgrade it with V2 and create a separate V2 document.
		 * Both the V1 no-op and the V2 `label` upgrade must keep strings readable and writable in the enabled document.
		 * The fresh V2 document must still exclude strings from `priority`: preserving existing permissions does not enable them in new documents.
		 */
		it("preserves enabled types after a feature-flag rollback and a later upgrade", () => {
			const stagedString = factory.staged(factory.string);
			const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(stringUpgrade !== undefined);
			const priorityTypes = factory.types([factory.number, stagedString]);
			class TaskV1 extends factory.object("Task", { priority: priorityTypes }) {}
			class TaskV2 extends factory.object("Task", {
				priority: priorityTypes,
				label: factory.optional(factory.string),
			}) {}
			const provider = new TestTreeProviderLite(2);
			const [documentTree, rolledBackTree] = provider.trees;
			const initial = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			initial.initialize({ priority: 1 });
			provider.synchronizeMessages();
			initial.dispose();
			const enabled = documentTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV1,
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
				}),
			);
			enabled.upgradeSchema();
			enabled.root.priority = "urgent";
			provider.synchronizeMessages();
			const rolledBack = asAlpha(
				rolledBackTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV1 })),
			);

			// Turning off the flag changes new permissions, not the document's already-enabled string support.
			assert.equal(rolledBack.compatibility.canView, true);
			assert.equal(rolledBack.isStagedUpgradeEnabled(stringUpgrade), "enabled");
			assert.equal(rolledBack.root.priority, "urgent");
			verifyNoOpUpgrade(provider, rolledBack);
			rolledBack.root.priority = "normal";
			provider.synchronizeMessages();
			assert.equal(enabled.root.priority, "normal");
			enabled.dispose();

			// The flag-off client can add a label without losing the string permission.
			const patched = documentTree.viewWith(
				new TreeViewConfigurationAlpha({ schema: TaskV2 }),
			);
			assert.equal(patched.compatibility.canView, false);
			assert.equal(patched.compatibility.canUpgrade, true);
			patched.upgradeSchema();
			assert.equal(patched.root.priority, "normal");
			patched.root.label = "Review";
			patched.root.priority = "high";
			provider.synchronizeMessages();
			assert.equal(rolledBack.root.priority, "high");
			for (const tree of provider.trees) {
				expectSchemaEqual(
					tree.kernel.checkout.storedSchema,
					toUpgradeSchema(TaskV2, StagedSchemaUpgradePolicy.permissive),
				);
			}

			// The older view can read the updated document, but cannot upgrade while omitting the newly stored label.
			assert.equal(rolledBack.compatibility.canView, true);
			assert.equal(rolledBack.compatibility.canUpgrade, false);

			verifyNoOpUpgrade(provider, patched);

			// The identical view and policy produce a numeric-only schema when there is no stored history to preserve.
			const freshProvider = new TestTreeProviderLite(1);
			const freshTree = freshProvider.trees[0];
			const fresh = asAlpha(
				freshTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
			);
			fresh.initialize({ priority: 1 });
			assert.equal(fresh.isStagedUpgradeEnabled(stringUpgrade), "disabled");
			expectSchemaEqual(freshTree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV2));
			assert.throws(() => {
				fresh.root.priority = "high";
			});
			patched.dispose();
			rolledBack.dispose();
		});

		/**
		 * V1 permits numeric `priority` values.
		 * V2 adds staged string support to `priority`; some documents enable it while others remain numeric-only.
		 * V3 completes the rollout by replacing the staged alternative with ordinary string support for `priority`.
		 *
		 * Open both V2 document histories with V3 and request an upgrade.
		 * V3 must upgrade the numeric-only document, but its upgrade of an enabled document must be a no-op.
		 * V2 clients must still collaborate, whereas V1 clients must reject the widened schema.
		 */
		for (const alreadyEnabled of [false, true]) {
			it(`removes the staged wrapper after rollout (strings already enabled: ${alreadyEnabled})`, () => {
				class TaskV1 extends factory.object("Task", { priority: factory.number }) {}
				const stagedString = factory.staged(factory.string);
				const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(stringUpgrade !== undefined);
				class TaskV2 extends factory.object("Task", {
					priority: factory.types([factory.number, stagedString]),
				}) {}
				class TaskV3 extends factory.object("Task", {
					priority: [factory.number, factory.string],
				}) {}
				const provider = new TestTreeProviderLite(3);
				const [stagedTree, migratedTree, originalTree] = provider.trees;
				const staged = asAlpha(
					stagedTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
				);
				staged.initialize({ priority: 1 });
				provider.synchronizeMessages();
				if (alreadyEnabled) {
					const enabler = migratedTree.viewWith(
						new TreeViewConfigurationAlpha({
							schema: TaskV2,
							stagedUpgradePolicy:
								StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
						}),
					);
					enabler.upgradeSchema();
					enabler.root.priority = "urgent";
					provider.synchronizeMessages();
					enabler.dispose();
				}
				const migrated = migratedTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));

				// Removing the wrapper requests string permission; it is not removal of the string type.
				assert.equal(migrated.compatibility.canView, alreadyEnabled);
				assert.equal(migrated.compatibility.canUpgrade, true);
				if (alreadyEnabled) {
					verifyNoOpUpgrade(provider, migrated);
				} else {
					migrated.upgradeSchema();
					provider.synchronizeMessages();
				}
				assert.equal(migrated.compatibility.canView, true);
				assert.equal(migrated.root.priority, alreadyEnabled ? "urgent" : 1);
				assert.equal(staged.isStagedUpgradeEnabled(stringUpgrade), "enabled");
				migrated.root.priority = "normal";
				provider.synchronizeMessages();
				assert.equal(staged.root.priority, "normal");
				staged.root.priority = "high";
				provider.synchronizeMessages();
				assert.equal(migrated.root.priority, "high");
				for (const tree of provider.trees) {
					expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV3));
				}
				verifyNoOpUpgrade(provider, staged);
				verifyNoOpUpgrade(provider, migrated);

				// A client that never shipped string support cannot participate after either rollout history.
				const original = originalTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
				verifyRejectedUpgrade(provider, original);
				migrated.dispose();
				staged.dispose();
			});
		}
	});

	describe("Replacing staged allowed types", () => {
		/**
		 * V1 declares a `priority` field that allows numbers and includes staged support for strings.
		 * V2 replaces that experiment with staged `Priority` nodes, initially leaving the new token disabled.
		 *
		 * Create a numeric-only document with V1's default policy.
		 * Open it with V2's default policy (the new staged type is not enabled), then explicitly enable `Priority`.
		 * The default-policy upgrade must be a no-op.
		 * The enabled document must permit numbers and `Priority` nodes, without acquiring the canceled string alternative.
		 */
		it("replaces a never-enabled staged type with another experimental type", () => {
			class TaskV1 extends factory.object("Task", {
				priority: factory.types([factory.number, factory.staged(factory.string)]),
			}) {}
			class Priority extends factory.object("Priority", { label: factory.string }) {}
			const stagedPriority = factory.staged(Priority);
			const priorityUpgrade = stagedPriority.metadata.stagedSchemaUpgrade;
			assert(priorityUpgrade !== undefined);
			class TaskV2 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedPriority]),
			}) {}
			const provider = new TestTreeProviderLite(2);
			const [documentTree, readerTree] = provider.trees;
			const original = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			original.initialize({ priority: 1 });
			provider.synchronizeMessages();
			const replacement = asAlpha(
				readerTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
			);

			// Neither experiment has been enabled, so swapping the staged declaration changes no stored permissions.
			assert.equal(replacement.compatibility.canView, true);
			assert.equal(replacement.isStagedUpgradeEnabled(priorityUpgrade), "disabled");
			verifyNoOpUpgrade(provider, replacement);
			replacement.root.priority = 2;
			provider.synchronizeMessages();
			assert.equal(original.root.priority, 2);
			for (const tree of provider.trees) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV2));
			}
			original.dispose();
			const enabled = documentTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV2,
					stagedUpgradePolicy:
						StagedSchemaUpgradePolicy.enabledStagedUpgrades(priorityUpgrade),
				}),
			);
			enabled.upgradeSchema();
			enabled.root.priority = new Priority({ label: "Urgent" });
			provider.synchronizeMessages();

			// The flag-off V2 client receives the new permission and can read and edit the structured value.
			assert.equal(replacement.isStagedUpgradeEnabled(priorityUpgrade), "enabled");
			const upgradedTask = replacement.root;
			assert(upgradedTask.priority instanceof Priority);
			assert.equal(upgradedTask.priority.label, "Urgent");
			upgradedTask.priority.label = "Normal";
			provider.synchronizeMessages();
			assert(enabled.root.priority instanceof Priority);
			assert.equal(enabled.root.priority.label, "Normal");
			for (const tree of provider.trees) {
				expectSchemaEqual(
					tree.kernel.checkout.storedSchema,
					toUpgradeSchema(TaskV2, StagedSchemaUpgradePolicy.permissive),
				);
			}
			verifyNoOpUpgrade(provider, replacement);
			enabled.dispose();
			replacement.dispose();
		});

		/**
		 * V1 declares a `priority` field that allows numbers and includes staged support for strings.
		 * V2 removes string support from `priority` and declares a staged `Priority` type instead.
		 *
		 * Initialize a V1 document with strings already enabled.
		 * Open it with V2 configured to enable the new `Priority` type.
		 * Enabling the replacement cannot make removal of the earlier permission safe.
		 * V2 must reject the document without changing the existing string value or stored schema.
		 */
		it("cannot replace an enabled staged type with an unsupported alternative", () => {
			const stagedString = factory.staged(factory.string);
			const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(stringUpgrade !== undefined);
			class TaskV1 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedString]),
			}) {}
			class Priority extends factory.object("Priority", { label: factory.string }) {}
			const stagedPriority = factory.staged(Priority);
			const priorityUpgrade = stagedPriority.metadata.stagedSchemaUpgrade;
			assert(priorityUpgrade !== undefined);
			class TaskV2 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedPriority]),
			}) {}
			const provider = new TestTreeProviderLite(2);
			const [documentTree, readerTree] = provider.trees;
			const original = documentTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV1,
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
				}),
			);
			original.initialize({ priority: "urgent" });
			provider.synchronizeMessages();
			const replacement = readerTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV2,
					stagedUpgradePolicy:
						StagedSchemaUpgradePolicy.enabledStagedUpgrades(priorityUpgrade),
				}),
			);

			// V2 still cannot read strings; composing a larger stored type set cannot repair that missing view support.
			verifyRejectedUpgrade(provider, replacement);
			assert.equal(original.root.priority, "urgent");
			original.dispose();
		});

		/**
		 * V1 declares a `priority` field that allows numbers and includes staged support for strings.
		 * V2 keeps strings staged for historical documents and adds a staged `Priority` alternative to the same field.
		 *
		 * Initialize a V1 document with strings already enabled.
		 * Select only the new `Priority` token when upgrading it with V2.
		 * Both strings and `Priority` nodes must remain writable.
		 * A V2 client using the default policy (no new staged types are enabled) must receive and preserve both permissions.
		 */
		it("retains the earlier staged type while enabling its replacement", () => {
			const stagedString = factory.staged(factory.string);
			const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
			assert(stringUpgrade !== undefined);
			class TaskV1 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedString]),
			}) {}
			class Priority extends factory.object("Priority", { label: factory.string }) {}
			const stagedPriority = factory.staged(Priority);
			const priorityUpgrade = stagedPriority.metadata.stagedSchemaUpgrade;
			assert(priorityUpgrade !== undefined);
			class TaskV2 extends factory.object("Task", {
				priority: factory.types([factory.number, stagedString, stagedPriority]),
			}) {}
			const provider = new TestTreeProviderLite(2);
			const [documentTree, upgradingTree] = provider.trees;
			const original = documentTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV1,
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
				}),
			);
			original.initialize({ priority: "urgent" });
			provider.synchronizeMessages();
			original.dispose();
			const observer = asAlpha(
				documentTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
			);
			const upgrading = upgradingTree.viewWith(
				new TreeViewConfigurationAlpha({
					schema: TaskV2,
					stagedUpgradePolicy:
						StagedSchemaUpgradePolicy.enabledStagedUpgrades(priorityUpgrade),
				}),
			);

			// V2 can already use the string document; the explicit upgrade adds Priority while preserving strings.
			assert.equal(upgrading.compatibility.canView, true);
			assert.equal(upgrading.compatibility.canUpgrade, true);
			assert.equal(observer.isStagedUpgradeEnabled(stringUpgrade), "enabled");
			assert.equal(observer.isStagedUpgradeEnabled(priorityUpgrade), "disabled");
			upgrading.upgradeSchema();
			provider.synchronizeMessages();
			assert.equal(upgrading.root.priority, "urgent");
			assert.equal(observer.isStagedUpgradeEnabled(stringUpgrade), "enabled");
			assert.equal(observer.isStagedUpgradeEnabled(priorityUpgrade), "enabled");
			upgrading.root.priority = new Priority({ label: "Structured priority" });
			provider.synchronizeMessages();
			assert(observer.root.priority instanceof Priority);
			assert.equal(observer.root.priority.label, "Structured priority");

			// Retaining string support is not just permission to read old data: strings can still be written.
			observer.root.priority = "normal";
			provider.synchronizeMessages();
			assert.equal(upgrading.root.priority, "normal");
			for (const tree of provider.trees) {
				expectSchemaEqual(
					tree.kernel.checkout.storedSchema,
					toUpgradeSchema(TaskV2, StagedSchemaUpgradePolicy.permissive),
				);
			}
			verifyNoOpUpgrade(provider, observer);
			verifyNoOpUpgrade(provider, upgrading);
			upgrading.dispose();
			observer.dispose();
		});

		describe("Removing a staged type at one location of a shared token", () => {
			/**
			 * V1 enables strings only at `primaryPriority`.
			 * V2 also stages strings at `fallbackPriority` using the same token.
			 * V3 removes the never-enabled string alternative from `fallbackPriority` while retaining it at `primaryPriority`.
			 *
			 * Open a V1 document with V2 and V3 using the default policy (no new staged types are enabled).
			 * Both V2 and V3 must use the existing document without changing its stored schema.
			 * V2 reports the token as "partial": strings are enabled at `primaryPriority`, but not `fallbackPriority`.
			 * V3 uses the token only at `primaryPriority`, where strings are already enabled, so it reports "enabled".
			 * No stored permissions change: `fallbackPriority` still permits only numbers.
			 */
			it("can remove a never-enabled location while another location remains enabled", () => {
				const stagedString = factory.staged(factory.string);
				const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(stringUpgrade !== undefined);
				const stagedPriorities = factory.types([factory.number, stagedString]);
				class TaskV1 extends factory.object("Task", {
					primaryPriority: stagedPriorities,
					fallbackPriority: factory.number,
				}) {}
				class TaskV2 extends factory.object("Task", {
					primaryPriority: stagedPriorities,
					fallbackPriority: stagedPriorities,
				}) {}
				class TaskV3 extends factory.object("Task", {
					primaryPriority: stagedPriorities,
					fallbackPriority: factory.number,
				}) {}
				const provider = new TestTreeProviderLite(2);
				const [documentTree, readerTree] = provider.trees;
				const original = documentTree.viewWith(
					new TreeViewConfigurationAlpha({
						schema: TaskV1,
						stagedUpgradePolicy:
							StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
					}),
				);
				original.initialize({ primaryPriority: "urgent", fallbackPriority: 1 });
				provider.synchronizeMessages();
				original.dispose();
				const staged = asAlpha(
					documentTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
				);
				assert.equal(staged.isStagedUpgradeEnabled(stringUpgrade), "partial");
				verifyNoOpUpgrade(provider, staged);
				const reduced = asAlpha(
					readerTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV3 })),
				);

				// The status describes the locations in each view, not a document-wide switch.
				assert.equal(reduced.compatibility.canView, true);
				assert.equal(reduced.isStagedUpgradeEnabled(stringUpgrade), "enabled");
				verifyNoOpUpgrade(provider, reduced);
				reduced.root.primaryPriority = "normal";
				reduced.root.fallbackPriority = 2;
				provider.synchronizeMessages();
				assert.equal(staged.root.primaryPriority, "normal");
				assert.equal(staged.root.fallbackPriority, 2);
				for (const tree of provider.trees) {
					expectSchemaEqual(
						tree.kernel.checkout.storedSchema,
						toUpgradeSchema(TaskV1, StagedSchemaUpgradePolicy.permissive),
					);
				}

				// V2 still stages fallback strings, but preserving primary strings never enabled that other location.
				assert.throws(() => {
					staged.root.fallbackPriority = "low";
				});
				reduced.dispose();
			});

			/**
			 * V1 enables strings at `primaryPriority`.
			 * V2 stages the same token at both `primaryPriority` and `fallbackPriority`.
			 * V3 removes string support from `primaryPriority` but keeps it staged at `fallbackPriority`.
			 *
			 * Open the V1 document with V2 and request a no-op upgrade, then attempt an upgrade with V3.
			 * The remaining declaration at `fallbackPriority` must not make V3 compatible with stored strings at `primaryPriority`.
			 * Reject V3's upgrade without moving or removing the existing permission or data.
			 */
			it("cannot remove an enabled location by retaining the token at another field", () => {
				const stagedString = factory.staged(factory.string);
				const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
				assert(stringUpgrade !== undefined);
				const stagedPriorities = factory.types([factory.number, stagedString]);
				class TaskV1 extends factory.object("Task", {
					primaryPriority: stagedPriorities,
					fallbackPriority: factory.number,
				}) {}
				class TaskV2 extends factory.object("Task", {
					primaryPriority: stagedPriorities,
					fallbackPriority: stagedPriorities,
				}) {}
				class TaskV3 extends factory.object("Task", {
					primaryPriority: factory.number,
					fallbackPriority: stagedPriorities,
				}) {}
				const provider = new TestTreeProviderLite(2);
				const [documentTree, readerTree] = provider.trees;
				const original = documentTree.viewWith(
					new TreeViewConfigurationAlpha({
						schema: TaskV1,
						stagedUpgradePolicy:
							StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
					}),
				);
				original.initialize({ primaryPriority: "urgent", fallbackPriority: 1 });
				provider.synchronizeMessages();
				original.dispose();
				const staged = asAlpha(
					documentTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
				);
				assert.equal(staged.isStagedUpgradeEnabled(stringUpgrade), "partial");
				verifyNoOpUpgrade(provider, staged);
				const reduced = readerTree.viewWith(
					new TreeViewConfigurationAlpha({ schema: TaskV3 }),
				);
				verifyRejectedUpgrade(provider, reduced);
				assert.equal(staged.root.primaryPriority, "urgent");
				assert.equal(staged.root.fallbackPriority, 1);
				staged.dispose();
			});
		});

		describe("Changing the definition of a staged node type", () => {
			/**
			 * V1 declares numeric `priority` values and staged `Priority` nodes with string-valued `rank`, but never enables the staged upgrade.
			 * V2 reuses the `Priority` identifier with numeric `rank` and stages that revised definition.
			 *
			 * Create a numeric-only document with V1's default policy, excluding the staged node definition.
			 * Open it with V2's default policy (the staged type is not enabled), then explicitly enable V2's token.
			 * The historical document can adopt V2 because it has no stored reference to either `Priority` definition.
			 * Enabling V2's token must introduce only the new definition and allow clients declaring it to edit numeric `rank`.
			 */
			it("can change a staged-only node definition before it enters the stored schema", () => {
				class PriorityV1 extends factory.object("Priority", { rank: factory.string }) {}
				class TaskV1 extends factory.object("Task", {
					priority: factory.types([factory.number, factory.staged(PriorityV1)]),
				}) {}
				class PriorityV2 extends factory.object("Priority", { rank: factory.number }) {}
				const stagedPriority = factory.staged(PriorityV2);
				const priorityUpgrade = stagedPriority.metadata.stagedSchemaUpgrade;
				assert(priorityUpgrade !== undefined);
				class TaskV2 extends factory.object("Task", {
					priority: factory.types([factory.number, stagedPriority]),
				}) {}
				const provider = new TestTreeProviderLite(2);
				const [documentTree, readerTree] = provider.trees;
				const original = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
				original.initialize({ priority: 1 });
				provider.synchronizeMessages();
				const revised = asAlpha(
					readerTree.viewWith(new TreeViewConfigurationAlpha({ schema: TaskV2 })),
				);
				assert.equal(revised.compatibility.canView, true);
				assert.equal(revised.isStagedUpgradeEnabled(priorityUpgrade), "disabled");
				verifyNoOpUpgrade(provider, revised);
				for (const tree of provider.trees) {
					expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV2));
				}
				original.dispose();
				const enabled = documentTree.viewWith(
					new TreeViewConfigurationAlpha({
						schema: TaskV2,
						stagedUpgradePolicy:
							StagedSchemaUpgradePolicy.enabledStagedUpgrades(priorityUpgrade),
					}),
				);
				assert.equal(enabled.compatibility.canUpgrade, true);
				enabled.upgradeSchema();
				enabled.root.priority = new PriorityV2({ rank: 2 });
				provider.synchronizeMessages();

				// No string-rank definition was ever stored, so the newly enabled numeric definition has nothing to conflict with.
				assert.equal(revised.isStagedUpgradeEnabled(priorityUpgrade), "enabled");
				assert(revised.root.priority instanceof PriorityV2);
				assert.equal(revised.root.priority.rank, 2);
				revised.root.priority.rank = 3;
				provider.synchronizeMessages();
				assert(enabled.root.priority instanceof PriorityV2);
				assert.equal(enabled.root.priority.rank, 3);
				for (const tree of provider.trees) {
					expectSchemaEqual(
						tree.kernel.checkout.storedSchema,
						toUpgradeSchema(TaskV2, StagedSchemaUpgradePolicy.permissive),
					);
				}
				verifyNoOpUpgrade(provider, revised);
				enabled.dispose();
				revised.dispose();
			});

			/**
			 * V1 declares numeric `priority` values and staged `Priority` nodes with string-valued `rank`.
			 * V2 retains the staged `Priority` identifier but changes `rank` to number.
			 *
			 * Create a numeric-only document with V1's default policy, then explicitly enable `Priority` using the same view schema.
			 * Open the enabled V1 document with V2, testing both a stored `Priority` node and a document where no such node was ever inserted.
			 * The old definition is part of the stored schema as soon as the token is enabled, whether or not a `Priority` node is inserted.
			 * Both histories must reject V2 without changing the stored definition or content.
			 */
			for (const populated of [false, true]) {
				it(`cannot redefine an enabled staged node type (${populated ? "node present" : "node never inserted"})`, () => {
					class PriorityV1 extends factory.object("Priority", { rank: factory.string }) {}
					const stagedPriority = factory.staged(PriorityV1);
					const priorityUpgrade = stagedPriority.metadata.stagedSchemaUpgrade;
					assert(priorityUpgrade !== undefined);
					class TaskV1 extends factory.object("Task", {
						priority: factory.types([factory.number, stagedPriority]),
					}) {}
					class PriorityV2 extends factory.object("Priority", { rank: factory.number }) {}
					class TaskV2 extends factory.object("Task", {
						priority: factory.types([factory.number, factory.staged(PriorityV2)]),
					}) {}
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;
					const initial = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
					initial.initialize({ priority: 1 });
					provider.synchronizeMessages();
					initial.dispose();
					const enabled = documentTree.viewWith(
						new TreeViewConfigurationAlpha({
							schema: TaskV1,
							stagedUpgradePolicy:
								StagedSchemaUpgradePolicy.enabledStagedUpgrades(priorityUpgrade),
						}),
					);
					enabled.upgradeSchema();
					if (populated) {
						enabled.root.priority = new PriorityV1({ rank: "urgent" });
					}
					provider.synchronizeMessages();
					const before = TreeBeta.exportConcise(enabled.root);

					// Leaving the revised type staged does not hide an incompatible definition already used by the document's schema.
					const revised = readerTree.viewWith(
						new TreeViewConfigurationAlpha({ schema: TaskV2 }),
					);
					verifyRejectedUpgrade(provider, revised);
					assert.deepEqual(TreeBeta.exportConcise(enabled.root), before);
					enabled.dispose();
				});
			}
		});
	});

	// TODO: support adapters.

	// function makeTolerantRootAdapter(view: TreeStoredSchema): FieldAdapter {
	// 	return {
	// 		field: rootFieldKey,
	// 		convert: (field): TreeFieldStoredSchema => {
	// 			const allowed = allowsFieldSuperset(defaultSchemaPolicy, view, field, tolerantRoot);
	// 			const out: TreeFieldStoredSchema = allowed ? root : field;
	// 			return out;
	// 		},
	// 	};
	// }

	// /**
	//  * This shows basic usage of stored and view schema including adapters.
	//  */
	// it("adapters", () => {
	// 	// Build a schema repository.
	// 	// This will represent our view schema for a simple canvas application,
	// 	// same as the above example, but after some schema changes.
	// 	const viewCollection: SchemaCollection = {
	// 		rootFieldSchema: root,
	// 		treeSchema: treeViewSchema.treeSchema,
	// 		policy: defaultSchemaPolicy,
	// 		adapters: {},
	// 	};

	// 	// Register an adapter that handles a missing root.
	// 	// Currently we are just declaring that such a handler exits:
	// 	// the API for saying what to do in this case are not done.
	// 	const adapters: Adapters = {
	// 		fieldAdapters: new Map([[rootFieldKey, makeTolerantRootAdapter(viewCollection)]]),
	// 	};
	// 	// Compose all the view information together.
	// 	const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

	// 	// Like the "basic" example, start with an empty document:
	// 	const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 	assert(stored.tryUpdateRootFieldSchema(emptyField));

	// 	// Open document, and check it's compatibility with our application:
	// 	const compat = view.checkCompatibility(stored);

	// 	// As long as we are willing to use adapters, the application should be able to read this document.
	// 	assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);

	// 	// And since the document schema currently excludes empty roots, its also incompatible for writing:
	// 	assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

	// 	// Additionally even updating the document schema can't avoid needing an adapter for the root,
	// 	// since the new schema would be incompatible with possible existing document content (empty documents).
	// 	assertEnumEqual(
	// 		Compatibility,
	// 		compat.writeAllowingStoredSchemaUpdates,
	// 		Compatibility.RequiresAdapters,
	// 	);

	// 	// Like with the basic example,
	// 	// the app makes a choice here about its policy for if and when to update stored schema.
	// 	// Lets assume eventually it updates the schema, either eagerly or lazily.

	// 	// We can update the root to be optional:
	// 	// TODO: add an automated way to determine that this is an upgrade that is needed and allowed.
	// 	stored.tryUpdateRootFieldSchema(tolerantRoot);
	// 	for (const [key, schema] of view.schema.treeSchema) {
	// 		// All the tree schema in the view should be compatible with the stored schema,
	// 		// so for this particular case we assert these all pass.
	// 		assert(stored.tryUpdateTreeSchema(key, schema));
	// 	}

	// 	// That will cause the document stored schema to change,
	// 	// which will notify and applications with the document open.
	// 	// They can recheck their compatibility:
	// 	const compatNew = view.checkCompatibility(stored);
	// 	// We still need the adapter to handle empty documents.
	// 	assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
	// 	// It is now possible to write our data into the document, since we have updated its stored schema.
	// 	assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
	// });

	// /**
	//  * Shows a schema update involving both cases:
	//  * 1. a type that gets a new identifier since its new format is not compatible with the old one.
	//  * 2. a type which is updated in place (same identifier)
	//  *
	//  * An adapter is used to allow the view schema (and thus application logic)
	//  * to not refer to the old types, and instead factor legacy schema handling into a library of adapters.
	//  */
	// it("schema updating using adapters", () => {
	// 	// In this version of the app,
	// 	// we decided that text should be organized into a hierarchy of formatting ranges.
	// 	// We are doing this schema change in an incompatible way, and thus introducing a new identifier:
	// 	const formattedTextIdentifier: TreeNodeSchemaIdentifier = brand(
	// 		"2cbc277e-8820-41ef-a3f4-0a00de8ef934",
	// 	);
	// 	const builder = new SchemaBuilder("adapters examples", defaultContentLibrary);
	// 	const formattedText = builder.objectRecursive(formattedTextIdentifier, {
	// 		content: FlexFieldSchema.createUnsafe(
	// 			FieldKinds.sequence,
	// 			() => formattedText,
	// 			codePoint,
	// 		),
	// 		size: (number),
	// 	});

	// 	// We are also updating positionedCanvasItem to accept the new type.
	// 	// It would also be possible to make this accept both types, and do this example without adapters,
	// 	// but for this example we assume the application does not want to deal with the old text format,
	// 	// so we will support it using adapters.
	// 	// Were we not batching all these examples in one scope, this would reuse the `positionedCanvasItem` name
	// 	// as no version of the app need both view schema at the same time
	// 	// (except for some approaches for staging roll-outs which are not covered here).
	// 	const positionedCanvasItemNew = builder.object(positionedCanvasItemIdentifier, {
	// 		position: (point),
	// 		// Note that we are specifically excluding the old text here
	// 		content: (formattedText),
	// 	});
	// 	// And canvas is still the same storage wise, but its view schema references the updated positionedCanvasItem2:
	// 	const canvas2 = builder.object(canvasIdentifier, {
	// 		items: FlexFieldSchema.create(FieldKinds.sequence, positionedCanvasItemNew),
	// 	});

	// 	const viewCollection: SchemaCollection = builder.intoSchema(
	// 		SchemaBuilder.required(canvas2),
	// 	);

	// 	const textAdapter: TreeAdapter = { input: textIdentifier, output: formattedTextIdentifier };

	// 	// Include adapters for all compatibility cases: empty root and old text.
	// 	const rootAdapter: FieldAdapter = makeTolerantRootAdapter(viewCollection);
	// 	const adapters: Adapters = {
	// 		fieldAdapters: new Map([[rootFieldKey, rootAdapter]]),
	// 		tree: [textAdapter],
	// 	};

	// 	const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

	// 	// Check this works for empty documents:
	// 	{
	// 		const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 		assert(stored.tryUpdateRootFieldSchema(emptyField));
	// 		const compat = view.checkCompatibility(stored);
	// 		assert(compat.read === Compatibility.RequiresAdapters);
	// 		assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);
	// 	}

	// 	// Check this works for documents with old text
	// 	{
	// 		const stored = new TestSchemaRepository(defaultSchemaPolicy);
	// 		assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
	// 		assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
	// 		assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
	// 		assert(
	// 			stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem),
	// 		);
	// 		assert(stored.tryUpdateTreeSchema(textIdentifier, text));
	// 		assert(stored.tryUpdateTreeSchema(codePoint.name, codePoint));
	// 		// This is the root type produced by the adapter for the root.
	// 		assert(stored.tryUpdateRootFieldSchema(tolerantRoot));

	// 		const compat = view.checkCompatibility(stored);
	// 		assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);
	// 		// Writing requires schema updates and/or adapters.
	// 		assertEnumEqual(
	// 			Compatibility,
	// 			compat.writeAllowingStoredSchemaUpdates,
	// 			Compatibility.RequiresAdapters,
	// 		);

	// 		// Note that if/when we update the stored schema for these changes,
	// 		// the adapters are still required, since that will just permit the new types,
	// 		// and don't exclude the old ones.
	// 		// TODO: add an automated way to determine that this is the needed upgrade (some way to union schema?).
	// 		const positionedCanvasItemTolerant = treeSchema({
	// 			objectNodeFields: {
	// 				position: fieldSchema(FieldKinds.required, [pointIdentifier]),
	// 				// Note that we are specifically supporting both formats here.
	// 				content: fieldSchema(FieldKinds.required, [
	// 					formattedTextIdentifier,
	// 					textIdentifier,
	// 				]),
	// 			},
	// 			mapFields: emptyField,
	// 		});
	// 		assert(
	// 			stored.tryUpdateTreeSchema(
	// 				positionedCanvasItemIdentifier,
	// 				positionedCanvasItemTolerant,
	// 			),
	// 		);
	// 		assert(stored.tryUpdateTreeSchema(formattedTextIdentifier, formattedText));

	// 		const compatNew = view.checkCompatibility(stored);
	// 		assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
	// 		// Now writing is possible:
	// 		assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
	// 	}
	// });
});
