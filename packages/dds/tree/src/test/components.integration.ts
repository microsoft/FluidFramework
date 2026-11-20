/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Example showing a document editor application which uses the `Component` library
 * to compose independently authored `Item` libraries which provide support for various content types.
 *
 * Each component's implementation lives in an independently authored library and does not need to depend on the other libraries,
 * even in cases like groups which can contain any `Item` type from any library included in the composition.
 * This even includes mutually recursive schemas, such as text which allows attachments (defined in one library)
 * which could be groups (defined in a separate library) containing text or more groups.
 *
 * Shared contracts describe item behavior, while the application selects the libraries and composes their schemas.
 * This walkthrough demonstrates that composition and a creation menu populated from the selected libraries.
 *
 * Consumers of the published package import from `@fluidframework/tree` and `@fluidframework/tree/alpha`.
 * See openPolymorphism.integration.ts for alternative patterns and additional edge cases.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	Tree,
	TreeViewConfiguration,
	type NodeKind,
	type TreeNode,
	type TreeNodeSchema,
} from "@fluidframework/tree";
import { Component, createIndependentTreeBeta } from "@fluidframework/tree/alpha";
import { createIndependentTreeView } from "@fluidframework/tree/beta";

// #region Shared contracts: a module that does not import either implementation

/**
 * Operations shared by all contributed items.
 */
export type Item = TreeNode & { describe(): string };

/**
 * A contributed schema with a creation-menu label and factory.
 */
export type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item> & {
	readonly description: string;
	create(): Item;
};

/**
 * Lazy references to the schemas contributed by an item library.
 */
export interface ItemComponent {
	readonly items: Component.LazyArray<ItemSchema>;
}

// #endregion

// #region Text library: independent of the group library

const textComponent = ((lazyComposition) => {
	const textSchema = Component.memoize(() => {
		const factory = new SchemaFactory("com.example.components.text");
		class TextItem extends factory.object("Text", {
			text: factory.string,
			attachment: factory.optional(lazyComposition().getComposed("items")),
		}) {
			public static readonly description = "Text";

			public static create(): TextItem {
				return new TextItem({ text: "New text" });
			}

			public describe(): string {
				return this.text;
			}

			public attach(item: Item): void {
				// The open insertion boundary retains runtime schema checks.
				this.attachment = item as never;
			}
		}
		return TextItem;
	});
	return { items: () => [textSchema], textSchema };
}) satisfies Component.Factory<ItemComponent>;

// #endregion

// #region Group library: depends on the shared contracts, not on TextItem

const groupComponent = ((lazyComposition) => {
	const groupSchema = Component.memoize(() => {
		const factory = new SchemaFactory("com.example.components.group");
		class Children extends factory.array("Children", lazyComposition().getComposed("items")) {}

		class Group extends factory.object("Group", { children: Children }) {
			public static readonly description = "Group";

			public static create(): Group {
				return new Group({ children: [] });
			}

			public describe(): string {
				return this.children.map((child) => child.describe()).join(", ");
			}

			public add(item: Item): void {
				// The open insertion boundary retains runtime schema checks.
				this.children.insertAtEnd(item as never);
			}
		}
		return Group;
	});
	return { items: () => [groupSchema], groupSchema };
}) satisfies Component.Factory<ItemComponent>;

// #endregion

// #region Application consumers: select libraries, compose once, then create the view

const editorComposition = Component.compose([groupComponent, textComponent]);
const EditorGroup = editorComposition.getComponent(groupComponent).groupSchema();
const EditorTextItem = editorComposition.getComponent(textComponent).textSchema();
const applicationFactory = new SchemaFactory("com.example.components.app");
class Root extends applicationFactory.object("Root", { group: EditorGroup }) {}

function createEditorView() {
	const view = createIndependentTreeView(new TreeViewConfiguration({ schema: Root }));
	view.initialize({ group: EditorGroup.create() });
	const nestedGroup = EditorGroup.create();
	const text = EditorTextItem.create();
	text.attach(EditorGroup.create());
	nestedGroup.add(text);
	view.root.group.add(nestedGroup);
	return view;
}

describe("Component library walkthrough", () => {
	it("constructs and edits a recursive model through the composed libraries", () => {
		const view = createEditorView();
		const nestedGroup = view.root.group.children[0];
		assert(Tree.is(nestedGroup, EditorGroup));
		const text = nestedGroup.children[0];
		assert(Tree.is(text, EditorTextItem));
		assert.equal(view.root.group.describe(), "New text");

		// An editor can populate its creation menu from the selected libraries rather than hard-coding item types.
		// Each menu entry supplies its own factory, so selecting it can create an item to add to the group.
		const menu = editorComposition.getComposed("items").map((getSchema) => getSchema());
		assert.deepEqual(
			menu.map((schema) => schema.description),
			["Group", "Text"],
		);
		const textOption = menu.find((schema) => schema.description === "Text");
		assert(textOption !== undefined);
		view.root.group.add(textOption.create());
		assert.equal(view.root.group.describe(), "New text, New text");
		assert.equal(view.root.group.children[0], nestedGroup);
		assert(text.attachment instanceof EditorGroup);
	});

	it("reuses the application composition without sharing document state", () => {
		const first = createEditorView();
		const second = createEditorView();
		assert(Tree.is(first.root.group, EditorGroup));
		assert(Tree.is(second.root.group, EditorGroup));
		first.root.group.add(EditorTextItem.create());
		assert.equal(first.root.group.describe(), "New text, New text");
		assert.equal(second.root.group.describe(), "New text");
		first.dispose();
		second.dispose();
	});

	it("reuses schemas within a composition, but not across independent compositions", () => {
		// All references within one composition must share schema classes to avoid duplicate identifiers.
		// Separate compositions can select different item types, so reusing a class across them would
		// retain the wrong allowed children. Here only the first composition permits text in groups.
		const first = Component.compose([groupComponent, textComponent]);
		const second = Component.compose([groupComponent]);
		const textOnly = Component.compose([textComponent]);
		const Group = first.getComponent(groupComponent).groupSchema();
		const TextItem = first.getComponent(textComponent).textSchema();
		assert.equal(first.getComponent(groupComponent).groupSchema(), Group);
		assert.equal(first.getComposed("items")[0](), Group);
		assert.notEqual(second.getComponent(groupComponent).groupSchema(), Group);
		assert.equal(first.getComponent(textComponent).textSchema(), TextItem);
		assert.equal(first.getComposed("items")[1](), TextItem);
		assert.notEqual(textOnly.getComponent(textComponent).textSchema(), TextItem);
	});

	it("rejects items that implement the contract but were not selected for this composition", () => {
		const withText = Component.compose([groupComponent, textComponent]);
		const TextItem = withText.getComponent(textComponent).textSchema();
		const composition = Component.compose([groupComponent]);
		const Group = composition.getComponent(groupComponent).groupSchema();
		assert.throws(() => Group.create().add(TextItem.create()), /schema/i);

		const textOnly = Component.compose([textComponent]);
		const TextOnly = textOnly.getComponent(textComponent).textSchema();
		assert.throws(() => TextOnly.create().attach(Group.create()), /schema/i);
	});

	it("can work when component types are erased", () => {
		// If an application only has access to fully type-erased components,
		// or most of the application code isn't aware of the specific components types being used, this pattern is still possible.
		// Here we manually type-erase them, so our example has some type-erased components to work with.
		const groupComponentErased: Component.Factory<ItemComponent> = groupComponent;
		const textComponentErased: Component.Factory<ItemComponent> = textComponent;

		const composition = Component.compose([groupComponentErased, textComponentErased]);
		const config = new TreeViewConfiguration({
			schema: SchemaFactory.optional(composition.getComposed("items")),
		});
		const view = createIndependentTreeBeta().viewWith(config);
		view.initialize(undefined);

		// There are a few ways such an application could create content.
		// A simple one is by enumerating all the content types it supports, and picking fom them.
		// A real application might populate a menubar or `/create` command with these options.
		// Such an approach could be used at the root, or inside components which can host other components like groups.
		// Our test will simply pick based on the description, taking the first arbitrarily, and assign it to the root.

		const menu = composition.getComposed("items").map((getSchema) => getSchema());
		const selected = menu[0];
		const newItem = selected.create();

		view.root = newItem;
	});
});

// #endregion
