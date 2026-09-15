/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { rootFieldKey, type FieldKey, type UpPath } from "../../core/index.js";
import { flexTreeSlot, type TreeIndexNodes } from "../../feature-libraries/index.js";
import {
	type InsertableTypedNode,
	SchemaFactory,
	type TreeNode,
	type TreeNodeSchema,
	type TreeIndexKeyFieldSelector,
	TreeViewConfiguration,
	createTreeIndex,
	TreeIndexKey,
	SchemaFactoryBeta,
	ObjectNodeSchema,
} from "../../simple-tree/index.js";
import { brand } from "../../util/index.js";
import { getView } from "../utils.js";

/** The field key under which the parentId node puts its identifier */
const parentKey: FieldKey = brand("parentKey");
/** The identifier of the parent node */
const parentId: FieldKey = brand("parentId");
/** The field key under which the childId node puts its identifier */
const childKey: FieldKey = brand("childKey");
/** The identifier of the child node */
const childId: FieldKey = brand("childId");

const schemaFactory = new SchemaFactory(undefined);
class IndexableChild extends schemaFactory.object("IndexableChild", {
	childKey: schemaFactory.identifier,
}) {}
class IndexableParent extends schemaFactory.object("IndexableParent", {
	parentKey: schemaFactory.identifier,
	child: schemaFactory.optional(IndexableChild),
}) {}

function isStringKey(key: TreeIndexKey): key is string {
	return typeof key === "string";
}

function createView(child?: InsertableTypedNode<typeof IndexableChild>) {
	const config = new TreeViewConfiguration({ schema: IndexableParent });
	const view = getView(config);
	view.initialize(new IndexableParent({ parentKey: parentId, child }));

	return { view, parent: view.root };
}

describe("simple tree indexes", () => {
	function keyFieldSelector(schema: TreeNodeSchema) {
		if (
			schema.identifier === IndexableParent.identifier ||
			schema.identifier === IndexableChild.identifier
		) {
			return schema.identifier === IndexableParent.identifier ? parentKey : childKey;
		}
		return;
	}

	it("can index nodes", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const index = createTreeIndex(
			view,
			(s) => keyFieldSelector(s),
			() => 3,
			isStringKey,
			[IndexableParent, IndexableChild],
		);
		assert.equal(index.size, 2);

		// test that both keys have been indexed
		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});

	it("does not reify tree of nodes being scanned", () => {
		const { view, parent } = createView({ childKey: childId });
		const index = createTreeIndex(
			view,
			(s) => keyFieldSelector(s),
			(nodes) => nodes,
			isStringKey,
			[IndexableParent, IndexableChild],
		);

		const { forest } = view.checkout;
		const path: UpPath = {
			parent: {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			},
			parentField: brand("child"),
			parentIndex: 0,
		};
		const anchor = forest.anchors.track(path);
		const anchorNode =
			forest.anchors.locate(anchor) ?? assert.fail("should be able to find anchor to child");
		assert.equal(anchorNode.slots.has(flexTreeSlot), false);

		const children = index.get(childId);
		assert.equal(children?.length, 1);
		assert.equal(children[0], parent.child);
		assert.equal(anchorNode.slots.has(flexTreeSlot), true);
	});

	it("filters out removed nodes", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const index = createTreeIndex<typeof IndexableParent, string, TreeIndexNodes<TreeNode>>(
			view,
			(schema) => keyFieldSelector(schema),
			(nodes) => nodes,
			isStringKey,
		);

		assert.equal(index.size, 2);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId)?.length, 1);

		parent.child = undefined;

		assert.equal(index.size, 1);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId), undefined);
	});

	it("updates when values fields are updated", () => {
		class OtherIndexableChild extends schemaFactory.object("IndexableChild", {
			other: schemaFactory.string,
		}) {}
		class OtherIndexableParent extends schemaFactory.object("IndexableParent", {
			child: schemaFactory.optional(OtherIndexableChild),
			other: schemaFactory.string,
		}) {}
		const config = new TreeViewConfiguration({ schema: OtherIndexableParent });
		const view = getView(config);
		view.initialize({ other: parentId, child: new OtherIndexableChild({ other: childId }) });
		const parent = view.root;
		const index = createTreeIndex(
			view,
			(schema) => "other",
			(nodes) => nodes.length,
			isStringKey,
			[OtherIndexableChild, OtherIndexableParent],
		);

		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), 1);
		assert.equal(index.size, 2);

		child.other = parentId;
		assert.equal(index.get(parentId), 2);
		assert.equal(index.size, 1);
	});

	it("translates object property keys to stored keys", () => {
		class Person extends schemaFactory.object("PersonWithStoredName", {
			displayName: schemaFactory.required(schemaFactory.string, { key: "name" }),
		}) {}
		const view = getView(new TreeViewConfiguration({ schema: Person }));
		view.initialize({ displayName: "Alex" });

		const peopleByName = createTreeIndex(
			view,
			(schema) => (schema === Person ? "displayName" : undefined),
			(nodes) => nodes,
			isStringKey,
		);
		const explicitPeopleByName = createTreeIndex(
			view,
			() => "displayName",
			(nodes) => nodes,
			isStringKey,
			[Person],
		);

		assert.deepEqual(peopleByName.get("Alex"), [view.root]);
		assert.deepEqual(explicitPeopleByName.get("Alex"), [view.root]);

		view.root.displayName = "Sam";

		assert.equal(peopleByName.get("Alex"), undefined);
		assert.deepEqual(peopleByName.get("Sam"), [view.root]);
		assert.equal(explicitPeopleByName.get("Alex"), undefined);
		assert.deepEqual(explicitPeopleByName.get("Sam"), [view.root]);
	});

	it("rejects an object stored key used as a property key", () => {
		class Person extends schemaFactory.object("PersonRejectsStoredName", {
			displayName: schemaFactory.required(schemaFactory.string, { key: "name" }),
		}) {}
		const view = getView(new TreeViewConfiguration({ schema: Person }));
		view.initialize({ displayName: "Alex" });

		assert.throws(
			() =>
				createTreeIndex(
					view,
					(schema) => (schema === Person ? "name" : undefined),
					(nodes) => nodes,
					isStringKey,
				),
			(error: Error) =>
				error instanceof UsageError &&
				error.message.includes('The property key "name" selected for schema') &&
				error.message.endsWith("does not exist."),
		);
	});

	it("can be defined using a map of schemas to field keys", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const keyFieldSelectorMap: ReadonlyMap<TreeNodeSchema, string> = new Map<
			TreeNodeSchema,
			string
		>([
			[IndexableParent, parentKey],
			[IndexableChild, childKey],
		]);
		const index = createTreeIndex(view, keyFieldSelectorMap, () => 3, isStringKey, [
			IndexableParent,
			IndexableChild,
		]);
		assert.equal(index.size, 2);

		// test that both keys have been indexed
		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});

	it("can be defined using an object with a get method", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const selector: TreeIndexKeyFieldSelector = { get: keyFieldSelector };
		const index = createTreeIndex(view, selector, () => 3, isStringKey);

		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});

	describe("indexing all nodes by name", () => {
		const exampleSchemaFactory = new SchemaFactory("all-nodes-by-name");
		class NamedObject extends exampleSchemaFactory.object("NamedObject", {
			name: exampleSchemaFactory.string,
		}) {}
		class UnnamedObject extends exampleSchemaFactory.object("UnnamedObject", {
			value: exampleSchemaFactory.string,
		}) {}
		class StringMap extends exampleSchemaFactory.map(
			"StringMap",
			exampleSchemaFactory.string,
		) {}
		class Content extends exampleSchemaFactory.array("Content", [
			NamedObject,
			UnnamedObject,
			StringMap,
		]) {}

		it("docs example: indexes all nodes by name", () => {
			const view = getView(new TreeViewConfiguration({ schema: Content }));
			view.initialize([
				new NamedObject({ name: "Alex" }),
				new UnnamedObject({ value: "unnamed" }),
				new StringMap(new Map([["name", "map entry"]])),
			]);

			// Start of the example in ../../simple-tree/api/simpleTreeIndex.ts. Keep this range in sync.
			const byName = createTreeIndex(
				view,
				(schema) =>
					schema instanceof ObjectNodeSchema && schema.fields.has("name") ? "name" : undefined,
				(nodes) => nodes,
				(key): key is TreeIndexKey => true,
			);
			const namedAlex = byName.get("Alex");
			// End of the example in ../../simple-tree/api/simpleTreeIndex.ts.

			assert.deepEqual(namedAlex, [view.root[0]]);
			assert.equal(byName.get("unnamed"), undefined);
			assert.equal(byName.get("map entry"), undefined);
			assert.equal(byName.size, 1);
		});

		it("rejects a selected non-object schema", () => {
			const view = getView(new TreeViewConfiguration({ schema: StringMap }));
			view.initialize(new Map([["name", "Alex"]]));

			assert.throws(
				() =>
					createTreeIndex(
						view,
						(schema) => (schema === StringMap ? "name" : undefined),
						(nodes) => nodes,
						isStringKey,
					),
				(error: Error) =>
					error instanceof UsageError &&
					error.message ===
						'The property key "name" selected for schema "all-nodes-by-name.StringMap" cannot be used because the schema is not an object node schema.',
			);
		});

		it("rejects a selected optional field", () => {
			class OptionalName extends exampleSchemaFactory.object("OptionalName", {
				name: exampleSchemaFactory.optional(exampleSchemaFactory.string),
			}) {}
			const view = getView(new TreeViewConfiguration({ schema: OptionalName }));
			view.initialize({});

			assert.throws(
				() =>
					createTreeIndex(
						view,
						(schema) => (schema === OptionalName ? "name" : undefined),
						(nodes) => nodes,
						isStringKey,
					),
				(error: Error) =>
					error instanceof UsageError &&
					error.message.includes('The property key "name" selected for schema') &&
					error.message.endsWith(
						"must refer to a field that always contains exactly one value.",
					),
			);
		});

		it("validates selected schemas before they are instantiated", () => {
			class OptionalName extends exampleSchemaFactory.object("UninstantiatedOptionalName", {
				name: exampleSchemaFactory.optional(exampleSchemaFactory.string),
			}) {}
			class EmptyContent extends exampleSchemaFactory.array("InitiallyEmptyContent", [
				OptionalName,
			]) {}
			const view = getView(new TreeViewConfiguration({ schema: EmptyContent }));
			view.initialize([]);

			assert.throws(
				() =>
					createTreeIndex(
						view,
						(schema) => (schema === OptionalName ? "name" : undefined),
						(nodes) => nodes,
						isStringKey,
					),
				(error: Error) =>
					error instanceof UsageError &&
					error.message.endsWith(
						"must refer to a field that always contains exactly one value.",
					),
			);

			assert.doesNotThrow(() => view.root.insertAtEnd({ name: "Alex" }));
		});

		it("rejects a selected non-leaf name field with a UsageError", () => {
			class Child extends exampleSchemaFactory.object("Child", {
				value: exampleSchemaFactory.string,
			}) {}
			class NonLeafName extends exampleSchemaFactory.object("NonLeafName", { name: Child }) {}
			const view = getView(new TreeViewConfiguration({ schema: NonLeafName }));
			view.initialize({ name: { value: "Alex" } });

			assert.throws(
				() =>
					createTreeIndex(
						view,
						(schema) => (schema === NonLeafName ? "name" : undefined),
						(nodes) => nodes,
						isStringKey,
					),
				(error: Error) =>
					error instanceof UsageError &&
					error.message.includes('The property key "name" selected for schema') &&
					error.message.endsWith("must refer to a field that only allows leaf values."),
			);
		});

		it("rejects a key with an invalid type using a UsageError", () => {
			class NumericName extends exampleSchemaFactory.object("NumericName", {
				name: exampleSchemaFactory.number,
			}) {}
			const view = getView(new TreeViewConfiguration({ schema: NumericName }));
			view.initialize({ name: 42 });

			assert.throws(
				() =>
					createTreeIndex(
						view,
						(schema) => (schema === NumericName ? "name" : undefined),
						(nodes) => nodes,
						isStringKey,
					),
				(error: Error) =>
					error instanceof UsageError &&
					error.message.includes('The value in key field "name" selected for schema') &&
					error.message.endsWith("was rejected by isKeyValid."),
			);
		});

		it("breaks the checkout when an index update fails", () => {
			class NumericName extends exampleSchemaFactory.object("InsertedNumericName", {
				name: exampleSchemaFactory.number,
			}) {}
			class EmptyContent extends exampleSchemaFactory.array("EmptyNumericContent", [
				NumericName,
			]) {}
			const view = getView(new TreeViewConfiguration({ schema: EmptyContent }));
			view.initialize([]);
			createTreeIndex(
				view,
				(schema) => (schema === NumericName ? "name" : undefined),
				(nodes) => nodes,
				isStringKey,
			);
			let updateError: Error | undefined;

			assert.throws(
				() => view.root.insertAtEnd({ name: 42 }),
				(error: Error) => {
					updateError = error;
					return (
						error instanceof UsageError &&
						error.message.endsWith("was rejected by isKeyValid.")
					);
				},
			);
			assert.throws(
				() => view.root,
				(error: Error) =>
					error instanceof UsageError && (error as { cause?: unknown }).cause === updateError,
			);
		});

		it("skips schemas without a name field", () => {
			const view = getView(new TreeViewConfiguration({ schema: UnnamedObject }));
			view.initialize({ value: "unnamed" });

			const objectsByName = createTreeIndex(
				view,
				(schema) => (schema === NamedObject ? "name" : undefined),
				(nodes) => nodes,
				isStringKey,
			);

			assert.equal(objectsByName.size, 0);
		});
	});

	it("docs example: allows schemas to opt in using metadata", () => {
		const schemaFactoryBeta = new SchemaFactoryBeta("example");

		class UnindexedContent extends schemaFactoryBeta.object("UnindexedContent", {
			category: SchemaFactory.number,
		}) {}

		// Start of the example in ../../simple-tree/api/simpleTreeIndex.ts. Keep this range in sync.
		// A set of numeric categories we can index over.
		enum Category {
			News,
			Sports,
		}

		// A way for metadata to indicate what field, if any, their category is stored in.
		interface MetadataWithCategoryField {
			categoryField?: string;
		}

		// Example schema opting into the index for different fields.
		class Article extends schemaFactoryBeta.object(
			"Article",
			{ category: SchemaFactory.number },
			{
				metadata: {
					custom: { categoryField: "category" } satisfies MetadataWithCategoryField,
				},
			},
		) {}
		class Video extends schemaFactoryBeta.object(
			"Video",
			{ genre: SchemaFactory.number },
			{ metadata: { custom: { categoryField: "genre" } satisfies MetadataWithCategoryField } },
		) {}

		// ...
		// -- Start section omitted from example
		class Content extends schemaFactoryBeta.array("Content", [
			Article,
			Video,
			UnindexedContent,
		]) {}

		const config = new TreeViewConfiguration({ schema: Content });
		const view = getView(config);
		view.initialize([
			new Article({ category: Category.Sports }),
			new Video({ genre: Category.Sports }),
			new Article({ category: Category.News }),
			new UnindexedContent({ category: Category.Sports }),
		]);
		// -- End section omitted from example

		const contentByCategory = createTreeIndex(
			view,
			(schema) =>
				(schema.metadata.custom as MetadataWithCategoryField | undefined)?.categoryField,
			(nodes) => nodes,
			(key): key is Category => typeof key === "number",
		);
		const sportsContent = contentByCategory.get(Category.Sports);
		// End of the example in ../../simple-tree/api/simpleTreeIndex.ts.

		assert.deepEqual(sportsContent, [view.root[0], view.root[1]]);
		assert.deepEqual(contentByCategory.get(Category.News), [view.root[2]]);
	});
});
