/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { EmptyKey, storedEmptyFieldSchema } from "../../../core/index.js";
import { defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import { TreeBeta } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getDiscrepanciesInAllowedContent } from "../../../simple-tree/api/discrepancies.js";
import {
	checkSchemaCompatibility,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type ITree,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
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
	/**
	 * This shows basic usage of stored and view schema, including a schema change handled using the
	 * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
	 * Note that this focuses on simpler compatible cases
	 * (where old data meets the new schema and the schema is updated keeping the same identifier),
	 * and does only briefly mentions the case where a new identifier is needed
	 * (since adapters are not implemented yet, and they are the nice way to handle that).
	 */
	it("basic usage", () => {
		const builder = new SchemaFactoryAlpha("test");

		const codePoint = builder.objectAlpha("Primitive.CodePoint", {
			[EmptyKey]: builder.number,
		});

		// String made of unicode code points, allowing for sequence editing of a string.
		const text = builder.arrayAlpha("Text", codePoint);

		const point = builder.objectAlpha("Point", {
			x: builder.number,
			y: builder.number,
		});

		// A type that can be used to position items without an inherent position within the canvas.
		const positionedCanvasItem = builder.objectAlpha("PositionedCanvasItem", {
			position: point,
			content: text,
		});
		const canvas = builder.arrayAlpha("Canvas", positionedCanvasItem);

		const root = builder.required(canvas);

		const tolerantRoot = builder.optional(canvas);

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
			assert.deepEqual(compat, {
				canView: false,
				canUpgrade: false,
				isEquivalent: false,
				discrepancies: [
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
				],
				enabledUpgrades: new Map(),
			});

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
			assert.deepEqual(compatNew, {
				canView: true,
				canUpgrade: true,
				isEquivalent: true,
				discrepancies: undefined,
				enabledUpgrades: new Map(),
			});

			// Now lets imagine some time passes, and the developers want to add a second content type:

			const counter = builder.objectAlpha("Counter", {
				count: builder.number,
			});
			// Lets allow counters inside positionedCanvasItem, instead of just text:
			const positionedCanvasItem2 = builder.objectAlpha("PositionedCanvasItem", {
				position: point,
				content: [text, counter],
			});
			// And canvas is still the same storage wise, but its view schema references the updated positionedCanvasItem2:
			const canvas2 = builder.array("Canvas", positionedCanvasItem2);
			// Once again we will simulate reloading the app with different schema by modifying the view schema.
			const viewSchema3 = new TreeViewConfigurationAlpha({
				schema: builder.optional(canvas2),
			});

			// With this new schema, we can load the document just like before:
			const compat2 = checkSchemaCompatibility(viewSchema3, stored);
			assert.deepEqual(compat2, {
				canView: false,
				canUpgrade: true,
				isEquivalent: false,
				discrepancies: [
					{
						mismatch: "allowedTypes",
						location: {
							nodeType: "test.PositionedCanvasItem",
							fieldKey: "content",
						},
						view: ["test.Counter"],
						stored: [],
					},
				],
				enabledUpgrades: new Map(),
			});

			// This is the same case as above where we can choose to do a schema update if we want:
			assert(stored.tryUpdateTreeSchema(positionedCanvasItem2));
			assert(stored.tryUpdateTreeSchema(counter));

			// And recheck compat:
			const compat3 = checkSchemaCompatibility(viewSchema3, stored);
			assert.deepEqual(compat3, {
				canView: true,
				canUpgrade: true,
				isEquivalent: true,
				discrepancies: undefined,
				enabledUpgrades: new Map(),
			});
		}
	});

	/**
	 * User stories for removing optional fields from view schemas.
	 */
	describe("optional field removal", () => {
		const factory = new SchemaFactoryBeta("optional-field-removal");

		/**
		 * "V1" schema in most test cases below.
		 * Task schema declares an optional `foo` field that stores a number.
		 */
		class TaskWithFoo extends factory.object(
			"Task",
			{ title: factory.string, foo: factory.optional(factory.number) },
			{ allowUnknownOptionalFields: true },
		) {}

		/**
		 * "V2" schema in most test cases below.
		 * {@link TaskWithFoo} which omits the optional `foo` field.
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
					} else {
						// Both rejected rows use a V1 reader against schema widened to V3.
						// A V3 observer is therefore valid even if the document was created with V2.
						assert.equal(reader.compatibility.isEquivalent, false);
						const observer = documentTree.viewWith(
							new TreeViewConfiguration({ schema: TaskV3 }),
						);
						assert.equal(observer.root.foo, 42);
						observer.root.foo = "Still allowed";
						provider.synchronizeMessages();
						assert.equal(reader.compatibility.canView, false);
						assert.equal(reader.compatibility.canUpgrade, false);
						observer.dispose();
					}
					reader.dispose();
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
					assert.equal(reader.compatibility.isEquivalent, false);
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
		 * Prerequisites: existing safety rules, independent of optional-field preservation.
		 * Lower-level comparison tests cover several of these constraints.
		 * These integration checks also verify that a rejected upgrade submits no operation
		 * and leaves the stored schema and document data unchanged.
		 */
		describe("prerequisites", () => {
			/**
			 * Prepares typed document initialization for a prerequisite test case.
			 *
			 * @typeParam TSchema - The root schema that determines which initial content is permitted.
			 * @param schema - The schema used to create the original document.
			 * @param content - Initial content valid for `schema`, retained for later comparisons.
			 * @returns The initial content and a function that initializes a tree with the captured schema and content.
			 *
			 * @remarks
			 * Capturing the schema and content together preserves their type relationship in a table of different test cases.
			 * This helper does not create or initialize a document until the returned `initialize` function is called.
			 */
			function withDocument<TSchema extends ImplicitFieldSchema>(
				schema: TSchema,
				content: InsertableTreeFieldFromImplicitField<TSchema>,
			) {
				return {
					content,

					/**
					 * Initializes the supplied tree and returns its typed view.
					 *
					 * @param tree - An uninitialized tree for the original document.
					 * @returns The initialized view. The caller must dispose it when it is no longer needed.
					 *
					 * @remarks
					 * This writes the captured schema and content but does not synchronize other clients.
					 */
					initialize(tree: ITree) {
						const view = tree.viewWith(new TreeViewConfiguration({ schema }));
						view.initialize(content);
						return view;
					},
				};
			}

			class WithoutOptIn extends factory.object("Task", { title: factory.string }) {}
			class RequiredFoo extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.number },
				{ allowUnknownOptionalFields: true },
			) {}
			class WiderFoo extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional([factory.number, factory.string]) },
				{ allowUnknownOptionalFields: true },
			) {}
			class StringFoo extends factory.object("Foo", { text: factory.string }) {}
			class NumberFoo extends factory.object("Foo", { text: factory.number }) {}
			class OriginalNested extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional(StringFoo) },
				{ allowUnknownOptionalFields: true },
			) {}
			class ChangedNested extends factory.object(
				"Task",
				{ title: factory.string, foo: factory.optional(NumberFoo) },
				{ allowUnknownOptionalFields: true },
			) {}

			/**
			 * Each row changes exactly one constraint while keeping stored identifiers.
			 * Initialize using the original schema, then reject the changed view's upgrade.
			 */
			for (const { name, initialize, changed, content } of [
				{
					name: "cannot remove an optional field without the object option",
					changed: WithoutOptIn,
					...withDocument(TaskWithFoo, { title: initialTitle, foo: 42 }),
				},
				{
					name: "cannot remove a required field even with the object option",
					changed: TaskWithoutFoo,
					...withDocument(RequiredFoo, { title: initialTitle, foo: 42 }),
				},
				{
					name: "cannot narrow the types of a declared optional field",
					changed: TaskWithFoo,
					...withDocument(WiderFoo, { title: initialTitle, foo: "Stored string" }),
				},
				{
					name: "cannot reuse a node identifier with incompatible nested fields",
					changed: ChangedNested,
					...withDocument(OriginalNested, {
						title: initialTitle,
						foo: { text: "Stored string" },
					}),
				},
			] as const) {
				it(name, () => {
					const provider = new TestTreeProviderLite(2);
					const [documentTree, readerTree] = provider.trees;

					// #region Step 1: Create and synchronize the original document.
					const creator = initialize(documentTree);
					provider.synchronizeMessages();
					const schemaBefore = readerTree.kernel.checkout.storedSchema.clone();
					const sequenceNumber = provider.sequenceNumber;
					// #endregion Step 1

					// #region Step 2: The changed schema cannot view or upgrade this document.
					const reader = readerTree.viewWith(new TreeViewConfiguration({ schema: changed }));
					assert.equal(reader.compatibility.canView, false);
					assert.equal(reader.compatibility.canUpgrade, false);

					// A rejected upgrade breaks this view, so do not call its APIs again.
					assert.throws(
						() => reader.upgradeSchema(),
						validateUsageError(/cannot be upgraded/),
					);
					provider.synchronizeMessages();
					// #endregion Step 2

					// #region Step 3: Rejection must not change the stored schema or data.
					// The rejected request must not publish a change to other clients.
					assert.equal(provider.sequenceNumber, sequenceNumber);

					// Neither the local stored schema nor the collaborator's schema may change.
					expectSchemaEqual(readerTree.kernel.checkout.storedSchema, schemaBefore);
					expectSchemaEqual(documentTree.kernel.checkout.storedSchema, schemaBefore);

					// The unaffected collaborator must still be able to read all original field values.
					assert.deepEqual(TreeBeta.exportConcise(creator.root), content);
					creator.dispose();
					// #endregion Step 3
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
