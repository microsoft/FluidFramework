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
	type TreeNode,
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

	// Tests validating user scenarios around removal of fields from object schema.
	// Removal of optional fields is supported (when `allowUnknownOptionalFields` is enabled, which is the default).
	// Removal of required fields is not supported.
	describe("Field removal", () => {
		/**
		 * "V1" schema in many test cases below.
		 * Task schema declares an optional `foo` field that stores a number.
		 */
		class TaskWithFoo extends factory.object(
			"Task",
			{ title: factory.string, foo: factory.optional(factory.number) },
			{ allowUnknownOptionalFields: true },
		) {}

		/**
		 * "V2" schema in many test cases below.
		 * {@link TaskWithFoo} which omits the optional `foo` field present in V1.
		 */
		class TaskWithoutFoo extends factory.object(
			"Task",
			{ title: factory.string },
			{ allowUnknownOptionalFields: true },
		) {}

		const initialTitle = "Original task";

		/**
		 * The portion of a tree view needed by {@link verifyReadWrite}.
		 *
		 * @remarks
		 * Views with different schemas share this shape so the helper can edit their titles
		 * without depending on their other fields.
		 */
		interface TitledTreeView {
			/**
			 * The root node with a writable `title`.
			 * The root reference cannot be replaced through this interface.
			 */
			readonly root: TreeNode & { title: string };
		}

		/**
		 * A view paired with the field values expected by {@link verifyReadWrite}.
		 */
		interface ViewWithExpectedFields {
			/**
			 * The view to inspect and edit.
			 */
			readonly view: TitledTreeView;

			/**
			 * Expected exported field names and values visible to `view`, excluding `title`.
			 */
			readonly expectedFields: Readonly<Record<string, unknown>>;
		}

		/**
		 * Views, synchronization support, and expected field values for {@link verifyReadWrite}.
		 */
		interface VerifyReadWriteOptions {
			/**
			 * Connects the clients and synchronizes their changes after each title edit.
			 */
			readonly provider: TestTreeProviderLite;

			/**
			 * The view and expected fields for the client that receives the reader's title edit,
			 * then makes its own title edit.
			 */
			readonly creator: ViewWithExpectedFields;

			/**
			 * The view and expected fields for the client that makes the first title edit,
			 * then receives the creator's title edit.
			 */
			readonly reader: ViewWithExpectedFields;
		}

		/**
		 * Verifies visible field values and shared title edits through two views of the same document.
		 *
		 * @param options - The participating views, their synchronization provider, and their expected field values.
		 *
		 * @remarks
		 * Both views must permit read/write access and be synchronized before this function is called.
		 * Their titles must equal `initialTitle`.
		 * Each expected field map must describe all other exported fields for its view.
		 * A field listed in only one map must not be exposed as a property of the other view's root.
		 *
		 * This function changes the title to `"Edited by reader"`, then to `"Edited by creator"`.
		 * After each edit, it checks the receiving view's exported data.
		 * The view must have the new title and unchanged values for its other visible fields.
		 */
		function verifyReadWrite(options: VerifyReadWriteOptions): void {
			const { provider, creator, reader } = options;

			/**
			 * Checks that a view exports the expected title and other field values.
			 *
			 * @param participant - The view and its expected fields, excluding `title`.
			 * @param title - The expected shared title.
			 *
			 * @remarks
			 * The view must permit reading its root.
			 * The expected fields describe the complete export except for `title`.
			 * This comparison does not inspect data in unknown fields omitted by the export.
			 */
			function verifyVisibleFields(participant: ViewWithExpectedFields, title: string): void {
				// TODO: we have planned functionality to include unknown fields in the exported data.
				// Once that is implemented, we will need to account for it here.
				// Compare the whole export to detect missing values, changed values, or unexpected fields.
				assert.deepEqual(TreeBeta.exportConcise(participant.view.root), {
					title,
					...participant.expectedFields,
				});
			}

			/**
			 * Checks that fields expected only by one view are not exposed by the other view.
			 *
			 * @param source - The view whose expected fields supply the keys to check.
			 * @param target - The view that must not expose keys absent from its expected fields.
			 * @param targetName - The target view's name to include in assertion failures.
			 *
			 * @remarks
			 * The target view must permit reading its root.
			 * A key present only in the source's expected fields is treated as unknown to the target.
			 * Do not omit a known but empty target field from its expected fields if the source lists that key.
			 */
			function verifyUnknownFields(
				source: ViewWithExpectedFields,
				target: ViewWithExpectedFields,
				targetName: string,
			): void {
				for (const key of Object.keys(source.expectedFields)) {
					if (!Object.hasOwn(target.expectedFields, key)) {
						// Check the node's property API, not just its export, which can filter unknown fields.
						assert.equal(
							key in target.view.root,
							false,
							`${key} should be unknown to the ${targetName} view`,
						);
					}

					// TODO: We have planned functionality to expose data about unknown fields.
					// Once that is added, we should assert that unknown fields are correctly reported here.
				}
			}

			/**
			 * Edits the title, synchronizes clients, and checks the receiving view's data.
			 *
			 * @param sender - The view that writes the new title.
			 * @param recipient - The view that must receive the title and retain its other field values.
			 * @param title - The new shared title.
			 *
			 * @remarks
			 * Both views must permit read/write access to the same document.
			 * This helper uses the enclosing synchronization provider to deliver the edit.
			 * It leaves the document with the new title.
			 */
			function verifyTitleEdit(
				sender: ViewWithExpectedFields,
				recipient: ViewWithExpectedFields,
				title: string,
			): void {
				sender.view.root.title = title;

				// A local assignment alone does not prove that the other client receives the change.
				provider.synchronizeMessages();

				// The recipient must receive the title without losing fields that the sender does not know.
				verifyVisibleFields(recipient, title);
			}

			// Each client sees the shared title and exactly the field values expected for its own schema.
			verifyVisibleFields(creator, initialTitle);
			verifyVisibleFields(reader, initialTitle);

			// Fields expected only by one client must remain hidden from the other client's view.
			verifyUnknownFields(creator, reader, "reader");
			verifyUnknownFields(reader, creator, "creator");

			// Edits work in both directions without losing the recipient's other field values,
			// including values in fields unknown to the sender.
			verifyTitleEdit(reader, creator, "Edited by reader");
			verifyTitleEdit(creator, reader, "Edited by creator");
		}

		/**
		 * V1 has `foo?: number`; V2 removes it.
		 * For each direction, create the document with one version and open it with the other.
		 * Only V1 opening a fresh V2 document needs an upgrade, to add the missing field schema.
		 */
		describe("remove an optional field", () => {
			// In this scenario, V2 removes the optional "foo" field
			const schemas = { V1: TaskWithFoo, V2: TaskWithoutFoo };

			for (const [createdWith, viewedWith, requiresUpgrade] of [
				["V1", "V2", false],
				["V2", "V1", true],
			] as const) {
				it(`${createdWith} document -> ${viewedWith} view (${requiresUpgrade ? "upgrade required" : "no upgrade"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create the document with its original schema.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V1" ? { foo: 42 } : {}),
					});
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Open the other view and upgrade only if required.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);

					// If we expect an upgrade to be required, assert that the view cannot be used without upgrading.
					// Otherwise, the view should be usable without upgrading.
					assert.equal(reader.compatibility.canView, !requiresUpgrade);

					if (requiresUpgrade) {
						assert.equal(reader.compatibility.canUpgrade, true);
						reader.upgradeSchema();
						assert.equal(reader.compatibility.canView, true);

						// Upgrade should only be required for a V1 client viewing a V2 document.
						// In this case, "foo" should be present in the view after the upgrade.
						assert("foo" in reader.root);
						assert.equal(reader.root.foo, undefined);
						reader.root.foo = 42;
						provider.synchronizeMessages();
					}
					// #endregion Step 2

					// #region Step 3: Read and write without exposing or deleting unknown foo.
					assert.equal(creator.compatibility.canView, true);

					// Both histories now contain foo = 42, but only the V1 view exposes it.
					verifyReadWrite({
						provider,
						creator: {
							view: creator,
							expectedFields: createdWith === "V1" ? { foo: 42 } : {},
						},
						reader: {
							view: reader,
							expectedFields: viewedWith === "V1" ? { foo: 42 } : {},
						},
					});
					reader.dispose();
					creator.dispose();
					// #endregion Step 3
				});
			}

			/**
			 * Removing foo permits viewing without an upgrade.
			 * Explicitly requesting an upgrade must also succeed without removing the stored field.
			 */
			it("V2 can request a no-op upgrade of a V1 document", () => {
				const provider = new TestTreeProviderLite(2);
				const [documentTree, readerTree] = provider.trees;
				const creator = documentTree.viewWith(
					new TreeViewConfiguration({ schema: TaskWithFoo }),
				);
				creator.initialize({ title: initialTitle, foo: 42 });
				provider.synchronizeMessages();
				const reader = readerTree.viewWith(
					new TreeViewConfiguration({ schema: TaskWithoutFoo }),
				);
				const storedBefore = readerTree.kernel.checkout.storedSchema.clone();

				assert.equal(reader.compatibility.canView, true);
				verifyNoOpUpgrade(provider, reader);
				expectSchemaEqual(readerTree.kernel.checkout.storedSchema, storedBefore);
				verifyReadWrite({
					provider,
					creator: { view: creator, expectedFields: { foo: 42 } },
					reader: { view: reader, expectedFields: {} },
				});
				reader.dispose();
				creator.dispose();
			});
		});

		/**
		 * V1 has foo?: number; V2 removes foo and adds bar?: string.
		 * Both directions need an upgrade: add the view's field and retain the unknown stored field.
		 */
		describe("remove an optional field and add a different field", () => {
			class TaskWithBar extends factory.object(
				"Task",
				{ title: factory.string, bar: factory.optional(factory.string) },
				{ allowUnknownOptionalFields: true },
			) {}

			// In this scenario, V2 replaces foo with bar instead of using TaskWithoutFoo.
			const schemas = { V1: TaskWithFoo, V2: TaskWithBar };

			for (const [createdWith, viewedWith] of [
				["V1", "V2"],
				["V2", "V1"],
			] as const) {
				it(`${createdWith} document -> ${viewedWith} view (upgrade required)`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Populate the field declared by the creating version.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V1" ? { foo: 42 } : { bar: "Retained label" }),
					});
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Upgrade and write the other version's newly allowed field.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, false);
					assert.equal(reader.compatibility.canUpgrade, true);
					reader.upgradeSchema();
					assert.equal(reader.compatibility.canView, true);

					// Each row pairs opposite schemas: this guard selects V1 (foo), otherwise V2 (bar).
					// The upgrade adds the reader's field schema but does not populate that field.
					if ("foo" in reader.root) {
						assert.equal(reader.root.foo, undefined);
						reader.root.foo = 42;
					} else {
						assert.equal(reader.root.bar, undefined);
						reader.root.bar = "Retained label";
					}
					provider.synchronizeMessages();
					// #endregion Step 2

					// #region Step 3: Both versions can edit without deleting the other's field.
					assert.equal(creator.compatibility.canView, true);

					// Both values are now stored, but each view exposes only its version's field.
					verifyReadWrite({
						provider,
						creator: {
							view: creator,
							expectedFields: createdWith === "V1" ? { foo: 42 } : { bar: "Retained label" },
						},
						reader: {
							view: reader,
							expectedFields: viewedWith === "V1" ? { foo: 42 } : { bar: "Retained label" },
						},
					});
					reader.dispose();
					creator.dispose();
					// #endregion Step 3
				});
			}

			/**
			 * After either version adds its field to the other's document, the stored schema has both.
			 * Alternate upgrade requests from both clients. None may remove the other's field or
			 * start another schema-change cycle. Both creation histories must reach the same schema.
			 */
			for (const createdWith of ["V1", "V2"] as const) {
				it(`repeated upgrades preserve both fields (created with ${createdWith})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [treeV1, treeV2] = provider.trees;
					const viewV1 = treeV1.viewWith(new TreeViewConfiguration({ schema: TaskWithFoo }));
					const viewV2 = treeV2.viewWith(new TreeViewConfiguration({ schema: TaskWithBar }));

					// #region Step 1: Initialize one version, then upgrade through the other.
					if (createdWith === "V1") {
						viewV1.initialize({ title: initialTitle, foo: 42 });
					} else {
						viewV2.initialize({ title: initialTitle, bar: "Retained label" });
					}
					provider.synchronizeMessages();

					// The non-creating client needs its own field added: V2 adds bar, or V1 adds foo.
					const upgradingView = createdWith === "V1" ? viewV2 : viewV1;
					assert.equal(upgradingView.compatibility.canView, false);
					assert.equal(upgradingView.compatibility.canUpgrade, true);
					upgradingView.upgradeSchema();
					provider.synchronizeMessages();
					assert.equal(viewV1.compatibility.canView, true);
					assert.equal(viewV2.compatibility.canView, true);
					viewV1.root.foo = 43;
					provider.synchronizeMessages();
					viewV2.root.bar = "Updated label";
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Verify the same combined schema for either creation history.
					class CombinedTask extends factory.object(
						"Task",
						{
							title: factory.string,
							foo: factory.optional(factory.number),
							bar: factory.optional(factory.string),
						},
						{ allowUnknownOptionalFields: true },
					) {}
					const expectedSchema = toUpgradeSchema(CombinedTask);
					expectSchemaEqual(treeV1.kernel.checkout.storedSchema, expectedSchema);
					expectSchemaEqual(treeV2.kernel.checkout.storedSchema, expectedSchema);
					// #endregion Step 2

					// #region Step 3: Repeated requests make no changes and retain both values.
					for (let round = 0; round < 3; round++) {
						verifyNoOpUpgrade(provider, viewV1);
						verifyNoOpUpgrade(provider, viewV2);
					}
					expectSchemaEqual(treeV1.kernel.checkout.storedSchema, expectedSchema);
					expectSchemaEqual(treeV2.kernel.checkout.storedSchema, expectedSchema);

					// These helper roles control edit order; V1 is not necessarily the document's creator.
					verifyReadWrite({
						provider,
						creator: { view: viewV1, expectedFields: { foo: 43 } },
						reader: { view: viewV2, expectedFields: { bar: "Updated label" } },
					});
					viewV2.dispose();
					const combinedView = treeV2.viewWith(
						new TreeViewConfiguration({ schema: CombinedTask }),
					);
					assert.equal(combinedView.compatibility.canView, true);
					assert.equal(combinedView.root.foo, 43);
					assert.equal(combinedView.root.bar, "Updated label");
					combinedView.dispose();
					viewV1.dispose();
					// #endregion Step 3
				});
			}
		});

		/**
		 * V1 has `foo?: number`; V2 removes `foo`; V3 restores its original stored key and type.
		 * Cover every cross-version pair on fresh documents, plus both V2 upgrade histories.
		 */
		describe("remove and restore the same optional field", () => {
			const schemas = { V1: TaskWithFoo, V2: TaskWithoutFoo, V3: TaskWithFoo };

			// Create with the first version, open with the second, and add foo only when the
			// document was created with V2. V1 and V3 must read each other's data without upgrading.
			for (const [createdWith, viewedWith, requiresUpgrade] of [
				["V2", "V1", true],
				["V3", "V1", false],
				["V1", "V2", false],
				["V3", "V2", false],
				["V1", "V3", false],
				["V2", "V3", true],
			] as const) {
				it(`${createdWith} document -> ${viewedWith} view (${requiresUpgrade ? "upgrade required" : "no upgrade"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create a fresh document, not a document upgraded from V2.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V2" ? {} : { foo: 42 }),
					});
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Open the requested version and apply its expected upgrade.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, !requiresUpgrade);
					if (requiresUpgrade) {
						// Only fresh V2 documents need an upgrade here; the reader is V1 or V3.
						// Both readers declare foo, but adding its schema does not create a value.
						assert.equal(reader.compatibility.canUpgrade, true);
						reader.upgradeSchema();
						assert.equal(reader.compatibility.canView, true);
						assert("foo" in reader.root);
						assert.equal(reader.root.foo, undefined);
					}

					// V1 and V3 can write foo. A V2 reader leaves the existing value untouched.
					if ("foo" in reader.root) {
						reader.root.foo = 43;
					}
					provider.synchronizeMessages();
					// #endregion Step 2

					// #region Step 3: Verify shared edits, visible foo values, and hidden fields.
					assert.equal(creator.compatibility.canView, true);

					// A V2 reader preserves the initial 42; either other reader just wrote 43.
					// V2 omits foo from its expected export even when the document contains that value.
					const foo = viewedWith === "V2" ? 42 : 43;
					verifyReadWrite({
						provider,
						creator: { view: creator, expectedFields: createdWith === "V2" ? {} : { foo } },
						reader: { view: reader, expectedFields: viewedWith === "V2" ? {} : { foo } },
					});
					reader.dispose();
					creator.dispose();
					// #endregion Step 3
				});
			}

			/**
			 * Create with V2, let either V1 or V3 add foo, then open with the other version.
			 * The final client must see the stored value without another upgrade.
			 */
			for (const [upgradedWith, viewedWith] of [
				["V1", "V3"],
				["V3", "V1"],
			] as const) {
				it(`V2 document -> ${upgradedWith} upgrade -> ${viewedWith} view (no further upgrade)`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create with V2, then explicitly upgrade to add foo.
					const original = documentTree.viewWith(
						new TreeViewConfiguration({ schema: TaskWithoutFoo }),
					);
					original.initialize({ title: initialTitle });
					provider.synchronizeMessages();
					original.dispose();
					const upgraded = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[upgradedWith] }),
					);
					assert.equal(upgraded.compatibility.canView, false);
					assert.equal(upgraded.compatibility.canUpgrade, true);
					upgraded.upgradeSchema();
					assert.equal(upgraded.compatibility.canView, true);
					upgraded.root.foo = 42;
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: The other version reads and writes without upgrading.
					// The row pairs V1 with V3, whose foo declarations are identical in this scenario.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, true);
					assert.equal(reader.root.foo, 42);
					reader.root.foo = 43;
					provider.synchronizeMessages();
					verifyReadWrite({
						provider,
						creator: { view: upgraded, expectedFields: { foo: 43 } },
						reader: { view: reader, expectedFields: { foo: 43 } },
					});
					reader.dispose();
					upgraded.dispose();
					// #endregion Step 2
				});
			}
		});

		/**
		 * V1 declares `notes?: string`; V2 removes that field from the view.
		 * V3 restores it as `comments?: string` with the original stored key, "notes".
		 * V1 and V3 must read and edit the same stored field without an upgrade.
		 */
		describe("restore an optional field under a new property name", () => {
			class TaskWithNotes extends factory.object(
				"Task",
				{ title: factory.string, notes: factory.optional(factory.string) },
				{ allowUnknownOptionalFields: true },
			) {}
			class TaskWithComments extends factory.object(
				"Task",
				{
					title: factory.string,
					comments: factory.optional(factory.string, { key: "notes" }),
				},
				{ allowUnknownOptionalFields: true },
			) {}

			// The shared title-only schema represents V2: neither notes nor comments is declared.
			const schemas = { V1: TaskWithNotes, V2: TaskWithoutFoo, V3: TaskWithComments };

			// The V1-created document passes through a V2 view before V3 restores the field.
			// The reverse direction starts with a fresh V3 document and opens it directly with V1.
			for (const [createdWith, viewedWith] of [
				["V1", "V3"],
				["V3", "V1"],
			] as const) {
				const history = createdWith === "V1" ? " -> V2 view" : "";
				it(`${createdWith} document${history} -> ${viewedWith} view (no upgrade)`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create through the version's own property name.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V1"
							? { notes: "Original notes" }
							: { comments: "Original notes" }),
					});
					provider.synchronizeMessages();
					const schemaBefore = documentTree.kernel.checkout.storedSchema.clone();
					const sequenceBefore = provider.sequenceNumber;
					// #endregion Step 1

					// #region Step 2: V2 hides the original field without removing its stored data.
					if (createdWith === "V1") {
						const removedView = readerTree.viewWith(
							new TreeViewConfiguration({ schema: schemas.V2 }),
						);
						assert.equal(removedView.compatibility.canView, true);
						assert.deepEqual(TreeBeta.exportConcise(removedView.root), {
							title: initialTitle,
						});
						assert.equal("notes" in removedView.root, false);
						removedView.dispose();
					}
					// #endregion Step 2

					// #region Step 3: Restore or open the field through the other property name.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, true);

					assert.equal(provider.sequenceNumber, sequenceBefore);
					expectSchemaEqual(readerTree.kernel.checkout.storedSchema, schemaBefore);

					// V1 exposes notes; V3 exposes comments. Both refer to the same stored value.
					if (reader.root instanceof TaskWithNotes) {
						assert.equal(reader.root.notes, "Original notes");
						reader.root.notes = "Edited through reader property";
					} else {
						assert.equal(reader.root.comments, "Original notes");
						reader.root.comments = "Edited through reader property";
					}
					provider.synchronizeMessages();

					if (creator.root instanceof TaskWithNotes) {
						assert.equal(creator.root.notes, "Edited through reader property");
						creator.root.notes = "Edited through creator property";
					} else {
						assert.equal(creator.root.comments, "Edited through reader property");
						creator.root.comments = "Edited through creator property";
					}
					provider.synchronizeMessages();
					// #endregion Step 3

					// #region Step 4: Exports use each view's property name, not a second stored field.
					verifyReadWrite({
						provider,
						creator: {
							view: creator,
							expectedFields:
								createdWith === "V1"
									? { notes: "Edited through creator property" }
									: { comments: "Edited through creator property" },
						},
						reader: {
							view: reader,
							expectedFields:
								viewedWith === "V1"
									? { notes: "Edited through creator property" }
									: { comments: "Edited through creator property" },
						},
					});
					expectSchemaEqual(documentTree.kernel.checkout.storedSchema, schemaBefore);
					expectSchemaEqual(readerTree.kernel.checkout.storedSchema, schemaBefore);
					reader.dispose();
					creator.dispose();
					// #endregion Step 4
				});
			}
		});

		/**
		 * V1 has `foo?: number`; V2 removes `foo`; V3 restores `foo?: number | string`.
		 * A V3 upgrade can widen a V1 field, but V1 cannot narrow a V3 field.
		 * A V2 document has no foo constraint until a client upgrades it.
		 */
		describe("restore an optional field with wider allowed types", () => {
			class TaskV3 extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional([factory.number, factory.string]) },
				{ allowUnknownOptionalFields: true },
			) {}
			const schemas = { V1: TaskWithFoo, V2: TaskWithoutFoo, V3: TaskV3 };

			/**
			 * Every row records the creation version, an optional intermediate upgrade, and the final view.
			 * Use a number as the stored value even for V3: compatibility depends on allowed types,
			 * not on whether the current document happens to use strings.
			 */
			for (const [createdWith, upgradedWith, viewedWith, canUpgrade] of [
				["V1", undefined, "V3", true],
				["V3", undefined, "V1", false],
				["V2", undefined, "V1", true],
				["V2", undefined, "V3", true],
				["V2", "V1", "V3", true],
				["V2", "V3", "V1", false],
			] as const) {
				const history = upgradedWith === undefined ? "" : ` -> ${upgradedWith} upgrade`;
				it(`${createdWith} document${history} -> ${viewedWith} view (${canUpgrade ? "upgrade required" : "incompatible"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create the document and apply only the stated history.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V2" ? {} : { foo: 42 }),
					});
					provider.synchronizeMessages();
					creator.dispose();
					const historyView = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[upgradedWith ?? createdWith] }),
					);
					if (upgradedWith !== undefined) {
						// Only V2-created documents have an intermediate upgrade in this table.
						// Either upgrader (V1 or V3) adds foo and then stores the same numeric value.
						assert.equal(historyView.compatibility.canView, false);
						assert.equal(historyView.compatibility.canUpgrade, true);
						historyView.upgradeSchema();
						assert.equal(historyView.compatibility.canView, true);
						assert("foo" in historyView.root);
						historyView.root.foo = 42;
						provider.synchronizeMessages();
					}
					historyView.dispose();
					// #endregion Step 1

					// #region Step 2: Evaluate the final view against the resulting stored schema.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);

					// Every row either needs to add/widen foo or attempts the forbidden narrowing to V1.
					assert.equal(reader.compatibility.canView, false);
					assert.equal(reader.compatibility.canUpgrade, canUpgrade);
					if (canUpgrade) {
						// Successful rows add foo to a fresh V2 document or widen a numeric field for V3.
						reader.upgradeSchema();
						assert.equal(reader.compatibility.canView, true);

						// Only a fresh V2 document has no foo value. All other histories stored 42.
						// A schema upgrade permits new values but does not supply or replace them.
						assert.equal(
							reader.root.foo,
							createdWith === "V2" && upgradedWith === undefined ? undefined : 42,
						);
						reader.root.foo = 43;

						// Only V3 permits strings; the V1 reader must keep the numeric value.
						if (reader.root instanceof TaskV3) {
							reader.root.foo = "Now strings are allowed";
						}
						provider.synchronizeMessages();

						// An observer with the final schema checks the newly enabled writes remotely.
						// V1 may have become incompatible when the stored field was widened.
						const observer = documentTree.viewWith(
							new TreeViewConfiguration({ schema: schemas[viewedWith] }),
						);
						assert.equal(observer.compatibility.canView, true);

						// Match the write selected by the reader's schema, not the creation schema.
						const fields = {
							foo: viewedWith === "V3" ? "Now strings are allowed" : 43,
						};
						verifyReadWrite({
							provider,
							creator: { view: observer, expectedFields: fields },
							reader: { view: reader, expectedFields: fields },
						});
						observer.dispose();
						reader.dispose();
					} else {
						// Both rejected rows use a V1 reader against schema widened to V3.
						// A V3 observer is therefore valid even if the document was created with V2.

						const observer = documentTree.viewWith(
							new TreeViewConfiguration({ schema: TaskV3 }),
						);
						assert.equal(observer.root.foo, 42);
						observer.root.foo = "Still allowed";
						provider.synchronizeMessages();
						verifyRejectedUpgrade(provider, reader);
						observer.dispose();
					}
					// #endregion Step 2
				});
			}
		});

		/**
		 * V1 has `foo?: number`; V2 removes `foo`; V3 introduces `foo?: string` with the same stored key.
		 * Fresh V1 and V3 documents conflict. A fresh V2 document takes on the constraint of
		 * whichever version upgrades it first; the other version must then reject it.
		 */
		describe("restore an optional field with conflicting types", () => {
			class TaskV3 extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional(factory.string) },
				{ allowUnknownOptionalFields: true },
			) {}
			const schemas = { V1: TaskWithFoo, V2: TaskWithoutFoo, V3: TaskV3 };

			for (const [createdWith, upgradedWith, viewedWith] of [
				["V3", undefined, "V1"],
				["V1", undefined, "V3"],
				["V2", "V3", "V1"],
				["V2", "V1", "V3"],
			] as const) {
				const history = upgradedWith === undefined ? "" : ` -> ${upgradedWith} upgrade`;
				it(`${createdWith} document${history} -> ${viewedWith} view (incompatible)`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Establish the stored constraint before opening the conflicting view.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({ title: initialTitle });
					provider.synchronizeMessages();
					creator.dispose();
					const owner = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[upgradedWith ?? createdWith] }),
					);
					if (upgradedWith !== undefined) {
						// The intermediate-upgrade rows start with V2, which has no foo constraint.
						// V1 or V3 can introduce its type here before the opposite version is tested.
						assert.equal(owner.compatibility.canView, false);
						assert.equal(owner.compatibility.canUpgrade, true);
						owner.upgradeSchema();
					}
					assert.equal(owner.compatibility.canView, true);

					// The owner is always V1 or V3: V2 is used only before an explicit upgrade.
					if (owner.root instanceof TaskWithFoo) {
						owner.root.foo = 42;
					} else {
						assert(owner.root instanceof TaskV3);
						owner.root.foo = "Stored string";
					}
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Reject the conflicting view without removing the stored field.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, false);
					assert.equal(reader.compatibility.canUpgrade, false);
					reader.dispose();
					// #endregion Step 2

					// #region Step 3: Matching clients can still read and write the original data.
					const observer = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[upgradedWith ?? createdWith] }),
					);
					assert.equal(observer.compatibility.canView, true);

					// The rejected reader always uses the opposite type: V1 rejected strings, V3 rejected numbers.
					const fields = { foo: viewedWith === "V1" ? "Stored string" : 42 };
					verifyReadWrite({
						provider,
						creator: { view: owner, expectedFields: fields },
						reader: { view: observer, expectedFields: fields },
					});
					observer.dispose();

					// Attempt rejection after the read/write checks because the error invalidates this client's checkout.
					const rejected = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					verifyRejectedUpgrade(provider, rejected);
					owner.dispose();
					// #endregion Step 3
				});
			}
		});

		/**
		 * V1 has `foo?: Foo`, and `Foo` is reachable only through that field.
		 * V2 removes both the `foo` field and the `Foo` type from its reachable view schema.
		 * Viewing an existing document must preserve the unknown subtree; opening a fresh V2
		 * document with V1 requires adding both the `foo` field and its node type.
		 */
		describe("remove the only reference to a node type", () => {
			class Foo extends factory.object("Foo", { text: factory.string }) {}
			class TaskWithFooNode extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional(Foo) },
				{ allowUnknownOptionalFields: true },
			) {}
			const schemas = { V1: TaskWithFooNode, V2: TaskWithoutFoo };

			for (const [createdWith, viewedWith, requiresUpgrade] of [
				["V2", "V1", true],
				["V1", "V2", false],
			] as const) {
				it(`${createdWith} document -> ${viewedWith} view (${requiresUpgrade ? "upgrade required" : "no upgrade"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create with or without the only field that permits Foo.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V1" ? { foo: new Foo({ text: "Retained subtree" }) } : {}),
					});
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: View the unknown subtree, or upgrade to permit new Foo nodes.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, !requiresUpgrade);
					if (requiresUpgrade) {
						// This row is a V1 reader on a fresh V2 document, which has neither foo nor Foo.
						// The upgrade adds their schemas; the test must then create the first Foo value.
						assert.equal(reader.compatibility.canUpgrade, true);
						reader.upgradeSchema();
						assert.equal(reader.compatibility.canView, true);
						assert("foo" in reader.root);
						assert.equal(reader.root.foo, undefined);
						reader.root.foo = new Foo({ text: "Retained subtree" });
						provider.synchronizeMessages();
					}
					assert.equal(creator.compatibility.canView, true);

					// Either V1 created the subtree initially or its reader created it after upgrading.
					// In both cases only V1 exposes foo; V2 still treats it as unknown.
					const fields = { foo: { text: "Retained subtree" } };
					verifyReadWrite({
						provider,
						creator: { view: creator, expectedFields: createdWith === "V1" ? fields : {} },
						reader: { view: reader, expectedFields: viewedWith === "V1" ? fields : {} },
					});
					reader.dispose();
					// #endregion Step 2

					// #region Step 3: A view that knows Foo can still read and edit the nested data.
					// Both histories now store foo and Foo, so reopening with V1 needs no further upgrade.
					const restored = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskWithFooNode }),
					);
					assert.equal(restored.compatibility.canView, true);
					assert(restored.root.foo instanceof Foo);
					assert.equal(restored.root.foo.text, "Retained subtree");
					restored.root.foo.text = "Updated subtree";
					provider.synchronizeMessages();
					creator.dispose();
					const observer = documentTree.viewWith(
						new TreeViewConfiguration({ schema: TaskWithFooNode }),
					);
					assert.equal(observer.root.foo?.text, "Updated subtree");
					observer.dispose();
					restored.dispose();
					// #endregion Step 3
				});
			}
		});

		/**
		 * V1 declares `foo?: Foo`; V2 removes foo and declares `bar?: Bar`.
		 * Each node type is reachable only through its version's optional field.
		 * Both upgrade directions must retain the unknown field and its type while adding the known field and its type.
		 */
		describe("replace an optional field with a different node-valued field", () => {
			class Foo extends factory.object("Foo", { text: factory.string }) {}
			class TaskWithFooNode extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional(Foo) },
				{ allowUnknownOptionalFields: true },
			) {}

			class Bar extends factory.object("Bar", { text: factory.string }) {}
			class TaskWithBarNode extends factory.object(
				"Task",
				{ title: factory.string, bar: factory.optional(Bar) },
				{ allowUnknownOptionalFields: true },
			) {}

			const schemas = { V1: TaskWithFooNode, V2: TaskWithBarNode };

			// The reader always adds its own field and node type to a document created by the opposite version.
			for (const [createdWith, viewedWith] of [
				["V1", "V2"],
				["V2", "V1"],
			] as const) {
				it(`${createdWith} document -> ${viewedWith} view (upgrade required)`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Store a node whose type the other version does not declare.
					const creator = documentTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[createdWith] }),
					);
					creator.initialize({
						title: initialTitle,
						...(createdWith === "V1"
							? { foo: new Foo({ text: "Original Foo" }) }
							: { bar: new Bar({ text: "Original Bar" }) }),
					});
					provider.synchronizeMessages();
					// #endregion Step 1

					// #region Step 2: Upgrade while retaining the other version's field and type.
					const reader = readerTree.viewWith(
						new TreeViewConfiguration({ schema: schemas[viewedWith] }),
					);
					assert.equal(reader.compatibility.canView, false);
					assert.equal(
						reader.compatibility.canUpgrade,
						true,
						"The upgrade must preserve the unknown node-valued field and its node type",
					);
					reader.upgradeSchema();
					assert.equal(reader.compatibility.canView, true);

					// A V1 reader adds Foo; a V2 reader adds Bar. The upgrade itself creates no field value.
					if ("foo" in reader.root) {
						assert.equal(reader.root.foo, undefined);
						reader.root.foo = new Foo({ text: "Original Foo" });
					} else {
						assert.equal(reader.root.bar, undefined);
						reader.root.bar = new Bar({ text: "Original Bar" });
					}
					provider.synchronizeMessages();
					// #endregion Step 2

					// #region Step 3: Each client can still edit the node type known only to its own schema.
					assert.equal(creator.compatibility.canView, true);
					if ("foo" in creator.root) {
						assert(creator.root.foo instanceof Foo);
						assert.equal(creator.root.foo.text, "Original Foo");
						creator.root.foo.text = "Edited Foo";
					} else {
						assert(creator.root.bar instanceof Bar);
						assert.equal(creator.root.bar.text, "Original Bar");
						creator.root.bar.text = "Edited Bar";
					}
					provider.synchronizeMessages();

					if ("foo" in reader.root) {
						assert(reader.root.foo instanceof Foo);
						assert.equal(reader.root.foo.text, "Original Foo");
						reader.root.foo.text = "Edited Foo";
					} else {
						assert(reader.root.bar instanceof Bar);
						assert.equal(reader.root.bar.text, "Original Bar");
						reader.root.bar.text = "Edited Bar";
					}
					provider.synchronizeMessages();

					// Both nodes are stored, but each view exposes only its own field.
					verifyReadWrite({
						provider,
						creator: {
							view: creator,
							expectedFields:
								createdWith === "V1"
									? { foo: { text: "Edited Foo" } }
									: { bar: { text: "Edited Bar" } },
						},
						reader: {
							view: reader,
							expectedFields:
								viewedWith === "V1"
									? { foo: { text: "Edited Foo" } }
									: { bar: { text: "Edited Bar" } },
						},
					});
					creator.dispose();
					reader.dispose();
					// #endregion Step 3

					// #region Step 4: Reopen both schemas without upgrading and read the synchronized node edits.
					// Whichever version created the document, both node types must remain usable afterward.
					const viewV1 = documentTree.viewWith(
						new TreeViewConfiguration({ schema: TaskWithFooNode }),
					);
					const viewV2 = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskWithBarNode }),
					);
					assert.equal(viewV1.compatibility.canView, true);
					assert.equal(viewV2.compatibility.canView, true);
					assert(viewV1.root.foo instanceof Foo);
					assert(viewV2.root.bar instanceof Bar);
					assert.equal(viewV1.root.foo.text, "Edited Foo");
					assert.equal(viewV2.root.bar.text, "Edited Bar");
					assert.equal(viewV1.root.title, "Edited by creator");
					assert.equal(viewV2.root.title, "Edited by creator");
					viewV1.dispose();
					viewV2.dispose();
					// #endregion Step 4
				});
			}
		});

		/**
		 * V1 declares `notes?: string`.
		 * V2 removes `notes` and adds `label`.
		 * V3 restores an optional `notes` field, but stores a string array rather than a string.
		 *
		 * Upgrade a V1 or V3 document through V2, then attempt to open it with the other notes declaration.
		 * V2 must retain the original field's type and content, even when `notes` has never been populated.
		 * The incompatible restoration must reject viewing and upgrading without changing either client's document.
		 */
		describe("restore a removed string field as an array", () => {
			// V1 includes a `notes` field that stores a single string.
			class TaskV1 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(factory.string),
			}) {}

			// V2 retires `notes` and introduces `label`.
			class TaskV2 extends factory.object("Task", {
				title: factory.string,
				label: factory.optional(factory.string),
			}) {}

			// V3 retires `label` and adds a new `notes` field that stores an array of strings.
			// Note that this is version of `notes` is not compatible with the V1 version of that field.
			class NotesArray extends factory.array("NotesArray", factory.string) {}
			class TaskV3 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(NotesArray),
			}) {}

			// An empty field still has a stored type; absence of notes must not make incompatible reuse safe.
			for (const populated of [false, true]) {
				it(`V1 document -> V2 upgrade -> V3 view (${populated ? "populated" : "empty"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;
					const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
					creator.initialize({
						title: initialTitle,
						notes: populated ? "Original notes" : undefined,
					});
					provider.synchronizeMessages();
					const contentBefore = TreeBeta.exportConcise(creator.root);

					// V2 cannot write labels until their schema is added.
					// This upgrade must retain the string notes that V2 no longer declares.
					const reduced = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
					assert.equal(reduced.compatibility.canView, false);
					assert.equal(reduced.compatibility.canUpgrade, true);
					reduced.upgradeSchema();
					reduced.root.label = "Upgraded by V2";
					provider.synchronizeMessages();

					// Hiding notes from V2 must not change the title or notes still visible to the V1 client.
					assert.equal("notes" in reduced.root, false);
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);

					// Check the stored declaration as well as the data, including the case where notes has never held a value.
					class Expected extends factory.object("Task", {
						title: factory.string,
						notes: factory.optional(factory.string),
						label: factory.optional(factory.string),
					}) {}
					for (const tree of provider.trees) {
						expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
					}
					reduced.dispose();

					// V3 cannot reinterpret notes as an array, even if the historical string field is empty.
					const incompatible = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskV3 }),
					);
					verifyRejectedUpgrade(provider, incompatible);

					// The rejected V3 attempt must leave the original application able to read its unchanged document.
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);
					creator.dispose();
				});

				it(`V3 document -> V2 upgrade -> V1 view (${populated ? "populated" : "empty"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;
					const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
					creator.initialize({
						title: initialTitle,
						notes: populated ? new NotesArray(["Replacement notes"]) : undefined,
					});
					provider.synchronizeMessages();
					const contentBefore = TreeBeta.exportConcise(creator.root);

					// Rolling back application code does not roll back stored schema.
					// V2 needs label added before viewing, while the array field and its definition must remain stored.
					const reduced = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
					assert.equal(reduced.compatibility.canView, false);
					assert.equal(reduced.compatibility.canUpgrade, true);
					reduced.upgradeSchema();
					reduced.root.label = "Upgraded by V2";
					provider.synchronizeMessages();

					// V2 cannot access notes, but the V3 client must still see its original array or empty field.
					assert.equal("notes" in reduced.root, false);
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);

					// Retain the array type even when this document contains no NotesArray node.
					class Expected extends factory.object("Task", {
						title: factory.string,
						notes: factory.optional(NotesArray),
						label: factory.optional(factory.string),
					}) {}
					for (const tree of provider.trees) {
						expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
					}
					reduced.dispose();

					// Rolling back further to V1 cannot replace the retained array type with strings.
					const incompatible = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskV1 }),
					);
					verifyRejectedUpgrade(provider, incompatible);

					// A failed rollback to V1 must not convert or erase the newer client's data.
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);
					creator.dispose();
				});
			}
		});

		/**
		 * V1 declares `notes?: Notes` with string text.
		 * V2 removes `notes` and adds `label`.
		 * V3 restores `notes` using the same `Notes` node identifier, but its node definition uses a number for `text`, instead of a string.
		 *
		 * After V2 upgrades either version's document, the stored `Notes` definition must still describe the creating version.
		 * The opposite version must reject that definition, whether `notes` contains a node or is empty, without altering schema or data.
		 */
		describe("restore a removed node-valued field with an incompatible definition", () => {
			// The initial version of `Notes` uses a string for its `text`.
			class NotesV1 extends factory.object("Notes", { text: factory.string }) {}
			class TaskV1 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(NotesV1),
			}) {}

			// V2 retires `notes` and adds a new `label` field.
			class TaskV2 extends factory.object("Task", {
				title: factory.string,
				label: factory.optional(factory.string),
			}) {}

			// V3 retires `label` and adds a new `notes` field that uses a number for its `text`.
			// Note that this version of `notes` is not compatible with the V1 version of that field.
			class NotesV3 extends factory.object("Notes", { text: factory.number }) {}
			class TaskV3 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(NotesV3),
			}) {}

			// Both versions reuse the Notes identifier, so its nested definition matters even when notes is absent.
			for (const populated of [false, true]) {
				it(`V1 document -> V2 upgrade -> V3 view (${populated ? "populated" : "empty"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;
					const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
					creator.initialize({
						title: initialTitle,
						notes: populated ? new NotesV1({ text: "Original notes" }) : undefined,
					});
					provider.synchronizeMessages();
					const contentBefore = TreeBeta.exportConcise(creator.root);

					// V2 needs the new label field before it can view the document.
					// Upgrading must also retain Notes, even though V2 no longer references that type.
					const reduced = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
					assert.equal(reduced.compatibility.canView, false);
					assert.equal(reduced.compatibility.canUpgrade, true);
					reduced.upgradeSchema();
					reduced.root.label = "Upgraded by V2";
					provider.synchronizeMessages();

					// V2 hides the entire Notes subtree; V1 must still see exactly its original content.
					assert.equal("notes" in reduced.root, false);
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);

					// The preserved definition must still require string text, not just retain the Notes identifier.
					class Expected extends factory.object("Task", {
						title: factory.string,
						notes: factory.optional(NotesV1),
						label: factory.optional(factory.string),
					}) {}
					for (const tree of provider.trees) {
						expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
					}
					reduced.dispose();

					// Reusing the Notes identifier does not permit changing text from string to number.
					const incompatible = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskV3 }),
					);
					verifyRejectedUpgrade(provider, incompatible);

					// Rejecting the nested type conflict must not alter content still supported by V1.
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);
					creator.dispose();
				});

				it(`V3 document -> V2 upgrade -> V1 view (${populated ? "populated" : "empty"})`, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;
					const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
					creator.initialize({
						title: initialTitle,
						notes: populated ? new NotesV3({ text: 42 }) : undefined,
					});
					provider.synchronizeMessages();
					const contentBefore = TreeBeta.exportConcise(creator.root);

					// V2 can add labels, but cannot undo the numeric text type introduced by V3.
					const reduced = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
					assert.equal(reduced.compatibility.canView, false);
					assert.equal(reduced.compatibility.canUpgrade, true);
					reduced.upgradeSchema();
					reduced.root.label = "Upgraded by V2";
					provider.synchronizeMessages();

					// The newer client's notes remain readable even though the intermediate view hides them.
					assert.equal("notes" in reduced.root, false);
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);

					// Numeric text remains part of the stored schema even in the empty-notes variant.
					class Expected extends factory.object("Task", {
						title: factory.string,
						notes: factory.optional(NotesV3),
						label: factory.optional(factory.string),
					}) {}
					for (const tree of provider.trees) {
						expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
					}
					reduced.dispose();

					// V1 still expects string text and cannot read or upgrade this document.
					const incompatible = readerTree.viewWith(
						new TreeViewConfiguration({ schema: TaskV1 }),
					);
					verifyRejectedUpgrade(provider, incompatible);

					// The failed older-client upgrade must leave the V3 document intact.
					assert.deepEqual(TreeBeta.exportConcise(creator.root), contentBefore);
					creator.dispose();
				});
			}
		});

		/**
		 * V1 declares string `notes`.
		 * V2 removes `notes` and adds `label`.
		 * V3 introduces an optional array also named `notes`, but stores it under the new stored key "notesV3".
		 *
		 * Upgrade a V1 document through V2 and V3, preserving the original string and adding an initially empty array field.
		 * V1 and V3 must edit their separate `notes` fields independently, and subsequent upgrades must be no-ops.
		 */
		it("reuses a property name with a different stored key without replacing historical data", () => {
			// The initial version of the task has a `notes` field as a string.
			class TaskV1 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(factory.string),
			}) {}

			// V2 retires `notes` and adds a new `label` field.
			class TaskV2 extends factory.object("Task", {
				title: factory.string,
				label: factory.optional(factory.string),
			}) {}
			class NotesArray extends factory.array("NotesArray", factory.string) {}

			// V3 reintroduces `notes` as an array of strings with a new stored key.
			// The stored key differs from the original `notes` field, ensuring it is treated as a separate property, and preserving compatibility between V1 and V3.
			class TaskV3 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(NotesArray, { key: "notesV3" }),
				label: factory.optional(factory.string),
			}) {}
			const provider = new TestTreeProviderLite(3);
			const [originalTree, reducedTree, restoredTree] = provider.trees;
			const original = originalTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			original.initialize({ title: initialTitle, notes: "Original notes" });
			provider.synchronizeMessages();

			// Pass through the version that retires notes, making a real schema change rather than only changing views.
			const reduced = reducedTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
			assert.equal(reduced.compatibility.canUpgrade, true);
			reduced.upgradeSchema();
			reduced.root.label = "Keep this label";
			provider.synchronizeMessages();

			// The property is named notes in both views, but their different stored keys identify independent fields.
			// V3 needs its new notesV3 field added; this does not conflict with the retained string field.
			const restored = restoredTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
			assert.equal(restored.compatibility.canView, false);
			assert.equal(restored.compatibility.canUpgrade, true);
			restored.upgradeSchema();

			// A new stored key starts empty; the historical string must not be interpreted as the new array.
			assert.equal(restored.root.notes, undefined);
			restored.root.notes = new NotesArray(["New notes"]);
			provider.synchronizeMessages();

			// Writes through either property must leave the other version's differently keyed notes unchanged.
			assert.equal(original.root.notes, "Original notes");
			original.root.notes = "Edited historical notes";
			provider.synchronizeMessages();
			assert.deepEqual([...restored.root.notes], ["New notes"]);
			restored.root.notes.insertAtEnd("Another note");
			provider.synchronizeMessages();
			assert.equal(original.root.notes, "Edited historical notes");

			// Both fields coexist in storage. legacyNotes is only a convenient property name for this expected schema.
			class Expected extends factory.object("Task", {
				title: factory.string,
				legacyNotes: factory.optional(factory.string, { key: "notes" }),
				notes: factory.optional(NotesArray, { key: "notesV3" }),
				label: factory.optional(factory.string),
			}) {}
			for (const tree of provider.trees) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
			}

			// No version should try to replace the other version's field on subsequent upgrades.
			verifyNoOpUpgrade(provider, original);
			verifyNoOpUpgrade(provider, reduced);
			verifyNoOpUpgrade(provider, restored);

			// Shared title edits must preserve the different notes values exposed by V1 and V3.
			verifyReadWrite({
				provider,
				creator: { view: original, expectedFields: { notes: "Edited historical notes" } },
				reader: {
					view: restored,
					expectedFields: { notes: ["New notes", "Another note"], label: "Keep this label" },
				},
			});

			// V2 still exposes neither stored notes field, even after both have been edited.
			assert.equal("notes" in reduced.root, false);
			restored.dispose();
			reduced.dispose();
			original.dispose();
		});

		/**
		 * V1 declares `notes?: Notes`.
		 * V2 removes `notes` and adds `label`.
		 * V3 restores the original `notes` field and node identifiers while adding an optional `author` field to `Notes`.
		 *
		 * Upgrade a populated or empty V1 document through V2 and V3 without replacing existing text or creating missing notes.
		 * Older clients must still edit the shared fields without losing the `author` added by V3.
		 */
		for (const populated of [false, true]) {
			it(`restores a node-valued field with a compatible nested addition (${populated ? "populated" : "empty"})`, () => {
				class NotesV1 extends factory.object("Notes", { text: factory.string }) {}
				class TaskV1 extends factory.object("Task", {
					title: factory.string,
					notes: factory.optional(NotesV1),
				}) {}
				class TaskV2 extends factory.object("Task", {
					title: factory.string,
					label: factory.optional(factory.string),
				}) {}

				// Restore both stored identifiers while adding an optional field inside Notes.
				class NotesV3 extends factory.object("Notes", {
					text: factory.string,
					author: factory.optional(factory.string),
				}) {}
				class TaskV3 extends factory.object("Task", {
					title: factory.string,
					notes: factory.optional(NotesV3),
					label: factory.optional(factory.string),
				}) {}
				const provider = new TestTreeProviderLite(3);
				const [originalTree, reducedTree, restoredTree] = provider.trees;
				const original = originalTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
				original.initialize({
					title: initialTitle,
					notes: populated ? new NotesV1({ text: "Original notes" }) : undefined,
				});
				provider.synchronizeMessages();

				// V2 adds labels while retaining the hidden notes field and the original Notes definition.
				const reduced = reducedTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
				assert.equal(reduced.compatibility.canUpgrade, true);
				reduced.upgradeSchema();
				reduced.root.label = "Keep this label";
				provider.synchronizeMessages();
				assert.equal("notes" in reduced.root, false);

				// V3 knows the original text field, but must add author before its view can write that nested field.
				// This requirement depends on the stored schema, not on whether a Notes node currently exists.
				const restored = restoredTree.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
				assert.equal(restored.compatibility.canView, false);
				assert.equal(restored.compatibility.canUpgrade, true);
				restored.upgradeSchema();

				// The upgrade preserves existing text and does not create notes when the field was empty.
				assert.equal(restored.root.notes?.text, populated ? "Original notes" : undefined);
				if (!populated) {
					assert.equal(restored.root.notes, undefined);
					restored.root.notes = new NotesV3({ text: "Created after restoration" });
				}

				// Adding author to the schema permits a write; it does not supply a default author value.
				assert(restored.root.notes !== undefined);
				assert.equal(restored.root.notes.author, undefined);
				restored.root.notes.author = "Reviewer";
				provider.synchronizeMessages();

				// V1 can edit the shared text without exposing or deleting the author added by V3.
				assert(original.root.notes !== undefined);
				assert.equal("author" in original.root.notes, false);
				original.root.notes.text = "Edited by the original client";
				provider.synchronizeMessages();
				assert.equal(restored.root.notes.text, "Edited by the original client");
				assert.equal(restored.root.notes.author, "Reviewer");

				// All clients must agree on the expanded Notes definition, even when their views omit author or notes.
				for (const tree of provider.trees) {
					expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(TaskV3));
				}

				// Revisiting any application version must leave the accumulated schema and content usable.
				verifyNoOpUpgrade(provider, original);
				verifyNoOpUpgrade(provider, reduced);
				verifyNoOpUpgrade(provider, restored);

				// Verify that shared title edits also preserve the differently shaped nested exports.
				verifyReadWrite({
					provider,
					creator: {
						view: original,
						expectedFields: { notes: { text: "Edited by the original client" } },
					},
					reader: {
						view: restored,
						expectedFields: {
							notes: { text: "Edited by the original client", author: "Reviewer" },
							label: "Keep this label",
						},
					},
				});
				restored.dispose();
				reduced.dispose();
				original.dispose();
			});
		}

		/**
		 * V1 declares `Project.tasks` as an array of tasks, each with optional notes.
		 * V2 removes `notes` from `Task` and adds an optional `isApproved` field, leaving `Project`'s own fields unchanged.
		 *
		 * The upgrade from V1 to V2must succeed only when `Task` allows unknown optional fields, independently of `Project`'s setting.
		 * Verify that edits and newly inserted tasks preserve `notes` for older clients, and that rejected upgrades leave the document unchanged.
		 */
		describe("remove a field from objects below the root", () => {
			for (const projectAllowsUnknown of [false, true]) {
				for (const taskAllowsUnknown of [false, true]) {
					it(`uses the containing object's option (Project: ${projectAllowsUnknown}, Task: ${taskAllowsUnknown})`, () => {
						class TaskV1 extends factory.object("NestedTask", {
							title: factory.string,
							notes: factory.optional(factory.string),
						}) {}
						class ProjectV1 extends factory.object("Project", {
							tasks: factory.array("Tasks", TaskV1),
						}) {}

						// V2 retires `notes` and adds a new `isApproved` field.
						// V2's `allowUnknownOptionalFields` setting determines whether it will allow reading documents that contain unknown optional fields, such as the retired `notes` field.
						class TaskV2 extends factory.object(
							"NestedTask",
							{ title: factory.string, isApproved: factory.optional(factory.boolean) },
							{ allowUnknownOptionalFields: taskAllowsUnknown },
						) {}
						class ProjectV2 extends factory.object(
							"Project",
							{ tasks: factory.array("Tasks", TaskV2) },
							{ allowUnknownOptionalFields: projectAllowsUnknown },
						) {}
						const provider = new TestTreeProviderLite(2);
						const [originalTree, reducedTree] = provider.trees;
						const original = originalTree.viewWith(
							new TreeViewConfiguration({ schema: ProjectV1 }),
						);

						// Both tasks share one schema, despite only the first task containing historical notes.
						original.initialize({
							tasks: [
								{ title: "First task", notes: "Historical notes" },
								{ title: "Second task" },
							],
						});
						provider.synchronizeMessages();
						const reduced = reducedTree.viewWith(
							new TreeViewConfiguration({ schema: ProjectV2 }),
						);

						// Approval is not yet allowed, so the new view cannot be used immediately.
						// Upgrading is safe only when Task tolerates the notes field it omits; Project's setting is irrelevant.
						assert.equal(reduced.compatibility.canView, false);
						assert.equal(reduced.compatibility.canUpgrade, taskAllowsUnknown);
						if (taskAllowsUnknown) {
							reduced.upgradeSchema();

							// The upgraded view hides notes on every task, not just on tasks where a value was present.
							assert.equal(reduced.compatibility.canView, true);
							assert.equal("notes" in reduced.root.tasks[0], false);
							assert.equal("notes" in reduced.root.tasks[1], false);
							reduced.root.tasks[0].title = "Renamed task";
							reduced.root.tasks[1].isApproved = true;
							reduced.root.tasks.insertAtEnd(new TaskV2({ title: "New task" }));
							provider.synchronizeMessages();

							// Edits and insertion from V2 preserve historical notes, but do not populate notes on other tasks.
							assert.equal(original.root.tasks[0].title, "Renamed task");
							assert.equal(original.root.tasks[0].notes, "Historical notes");
							assert.equal(original.root.tasks[1].notes, undefined);
							assert.equal(original.root.tasks[2].notes, undefined);

							// An older client can write the retained field on a node created by the reduced view.
							original.root.tasks[2].notes = "Added by the original client";
							provider.synchronizeMessages();
							assert.equal("notes" in reduced.root.tasks[2], false);
							assert.equal(reduced.root.tasks[1].isApproved, true);

							// Either client can request another upgrade without losing the new task's hidden notes.
							verifyNoOpUpgrade(provider, original);
							verifyNoOpUpgrade(provider, reduced);
							assert.equal(original.root.tasks[2].notes, "Added by the original client");
							reduced.dispose();
						} else {
							verifyRejectedUpgrade(provider, reduced);
						}
						original.dispose();
					});
				}
			}
		});

		/**
		 * V1 declares optional `notes` and `estimate`.
		 * V2 removes `notes` and adds `isApproved`.
		 * V3 removes `estimate` and adds `label`.
		 *
		 * Upgrade the same V1 document through V2 and V3, keeping all three clients open.
		 * Both upgrades must retain earlier fields and values while adding the new fields.
		 * Clients must continue editing the fields they know, and repeated upgrades must preserve the combined schema without further operations.
		 */
		it("preserves fields removed by successive versions through multiple upgrades", () => {
			class TaskV1 extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(factory.string),
				estimate: factory.optional(factory.number),
			}) {}

			// V2 retires `notes` and adds a new `isApproved` field.
			class TaskV2 extends factory.object("Task", {
				title: factory.string,
				estimate: factory.optional(factory.number),
				isApproved: factory.optional(factory.boolean),
			}) {}

			// V3 retires `estimate` while adding a new `label` field.
			class TaskV3 extends factory.object("Task", {
				title: factory.string,
				isApproved: factory.optional(factory.boolean),
				label: factory.optional(factory.string),
			}) {}

			const provider = new TestTreeProviderLite(3);
			const [treeV1, treeV2, treeV3] = provider.trees;
			const viewV1 = treeV1.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			viewV1.initialize({ title: initialTitle, notes: "Original notes", estimate: 4 });
			provider.synchronizeMessages();

			// V2 requires a real upgrade to add `isApproved` while preserving the `notes` it no longer exposes.
			const viewV2 = treeV2.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
			assert.equal(viewV2.compatibility.canView, false);
			assert.equal(viewV2.compatibility.canUpgrade, true);
			viewV2.upgradeSchema();
			viewV2.root.isApproved = true;
			provider.synchronizeMessages();

			// V3 requires another upgrade to add `label`.
			// Both earlier unknown fields must survive this second composition.
			const viewV3 = treeV3.viewWith(new TreeViewConfiguration({ schema: TaskV3 }));
			assert.equal(viewV3.compatibility.canView, false);
			assert.equal(viewV3.compatibility.canUpgrade, true);
			viewV3.upgradeSchema();
			viewV3.root.label = "Ready";
			provider.synchronizeMessages();

			// V1 still reads both retired values, and V3 sees the approval written by V2.
			assert.equal(viewV1.root.notes, "Original notes");
			assert.equal(viewV1.root.estimate, 4);
			assert.equal(viewV3.root.isApproved, true);
			viewV1.root.notes = "Updated historical notes";
			viewV2.root.estimate = 8;
			provider.synchronizeMessages();

			// Older clients can still edit retired fields without making them visible to versions that omit them.
			assert.equal(viewV1.root.estimate, 8);
			assert.equal("notes" in viewV2.root, false);
			assert.equal("notes" in viewV3.root, false);
			assert.equal("estimate" in viewV3.root, false);

			// Storage accumulates all four optional fields rather than matching any single version's declarations.
			class Expected extends factory.object("Task", {
				title: factory.string,
				notes: factory.optional(factory.string),
				estimate: factory.optional(factory.number),
				isApproved: factory.optional(factory.boolean),
				label: factory.optional(factory.string),
			}) {}

			// Alternating application versions must settle on this combined schema, not repeatedly replace one another's fields.
			for (let round = 0; round < 2; round++) {
				verifyNoOpUpgrade(provider, viewV1);
				verifyNoOpUpgrade(provider, viewV2);
				verifyNoOpUpgrade(provider, viewV3);
			}
			for (const tree of provider.trees) {
				expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
			}

			// V1 and V3 can collaborate on titles while retaining each other's otherwise-unknown field values.
			verifyReadWrite({
				provider,
				creator: {
					view: viewV1,
					expectedFields: { notes: "Updated historical notes", estimate: 8 },
				},
				reader: { view: viewV3, expectedFields: { isApproved: true, label: "Ready" } },
			});

			// The intermediate client receives those shared edits and keeps access to its estimate and approval.
			assert.equal(viewV2.root.title, "Edited by creator");
			assert.equal(viewV2.root.estimate, 8);
			assert.equal(viewV2.root.isApproved, true);
			viewV3.dispose();
			viewV2.dispose();
			viewV1.dispose();
		});

		/**
		 * V1 requires `estimatedHours` on every task.
		 * V2 removes that field from its view.
		 *
		 * Open a V1 document with V2, which allows unknown optional fields but cannot supply the required `estimatedHours`.
		 * Viewing and upgrading must be rejected without changing schema, content, or operation count.
		 * The original client must remain able to read the task and its estimate.
		 */
		it("cannot remove a required field even when unknown optional fields are allowed", () => {
			class TaskV1 extends factory.object("Task", {
				title: factory.string,
				estimatedHours: factory.number,
			}) {}

			// V2 retires `estimatedHours`, but the original schema requires every task to have one.
			class TaskV2 extends factory.object("Task", { title: factory.string }) {}
			const provider = new TestTreeProviderLite(2);
			const [documentTree, readerTree] = provider.trees;
			const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: TaskV1 }));
			creator.initialize({ title: initialTitle, estimatedHours: 4 });
			provider.synchronizeMessages();

			// Unknown-field support applies only to optional fields; V2 cannot supply the required estimate on new tasks.
			// Reject both viewing and upgrading without changing either client's stored schema, data, or operation count.
			const reader = readerTree.viewWith(new TreeViewConfiguration({ schema: TaskV2 }));
			verifyRejectedUpgrade(provider, reader);

			// The failed retirement must leave the original application able to read the task and its estimate.
			assert.deepEqual(TreeBeta.exportConcise(creator.root), {
				title: initialTitle,
				estimatedHours: 4,
			});
			creator.dispose();
		});
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
			verifyNoOpUpgrade(provider, original);
			verifyNoOpUpgrade(provider, staged);
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
			verifyNoOpUpgrade(provider, rolledBack);
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
