/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * A document editor supports text items with attachments and groups containing other items.
 * The text and group models live in independently authored libraries: neither should import the other,
 * but text attachments must be able to contain groups, and groups must be able to contain text or more groups.
 * Shared contracts describe item behavior, while the application selects the libraries and composes their schemas.
 * This walkthrough demonstrates that composition and a creation menu populated from the selected libraries.
 *
 * Consumers of the published package import from `@fluidframework/tree` and `@fluidframework/tree/alpha`.
 * See openPolymorphism.integration.ts for alternative patterns and additional edge cases.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	TreeViewConfiguration,
	type NodeKind,
	type TreeNode,
	type TreeNodeSchema,
} from "@fluidframework/tree";
import {
	Component,
	createIndependentTreeBeta,
	independentView,
} from "@fluidframework/tree/alpha";

// #region Shared contracts: a module that does not import either implementation

/** Operations available on every contributed item, regardless of its stored representation. */
export type Item = TreeNode & { describe(): string };

/**
 * The schema contract for an item contributed by a library.
 * It includes a menu description and a factory so consumers can create items without knowing their constructors.
 */
export type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item> & {
	readonly description: string;
	create(): Item;
};

/**
 * The contributions each item library supplies to the application composition.
 * Lazy schema references allow the contributed types to refer to one another before all schemas are created.
 */
export interface ItemComponent {
	readonly items: Component.LazyArray<ItemSchema>;
}

// #endregion

// #region Text library: independent of the group library

function createTextSchema(composition: Component.Composed<ItemComponent>) {
	const factory = new SchemaFactory("com.example.components.text");
	class TextItem extends factory.object("Text", {
		text: factory.string,
		attachment: factory.optional(composition.getComposed("items")),
	}) {
		public static readonly description = "Text";

		public static create(): TextItem {
			return new TextItem({ text: "New text" });
		}

		public describe(): string {
			return this.text;
		}

		public attach(item: Item): void {
			// As with Group.add, the open insertion boundary retains runtime schema checks.
			this.attachment = item as never;
		}
	}
	return TextItem;
}

/** Attachments may include groups without this library importing the group implementation. */
const textComponent = ((lazyComposition) => {
	// Defer schema creation until composition is complete, then reuse the same class for both exports.
	// Creating it on every access would produce distinct classes with the same schema identifier.
	const textSchema = Component.memoize(() => createTextSchema(lazyComposition()));
	return {
		items: () => [textSchema],
		textSchema,
	};
}) satisfies Component.Factory<ItemComponent>;

// #endregion

// #region Group library: depends on the shared contracts, not on TextItem

function createGroupSchema(composition: Component.Composed<ItemComponent>) {
	// These schemas use fixed identifiers, so only one configured Group schema class can appear in a given view schema.
	// For patterns to allow a more generic reusable schema, see configurableSchemaLibrary.integration.ts instead.
	const factory = new SchemaFactory("com.example.components.group");
	class Children extends factory.array("Children", composition.getComposed("items")) {}

	class Group extends factory.object("Group", { children: Children }) {
		public static readonly description = "Group";

		public static create(): Group {
			return new Group({ children: [] });
		}

		public describe(): string {
			return this.children.map((child) => child.describe()).join(", ");
		}

		public add(item: Item): void {
			// The open contract cannot enumerate insertable types. SharedTree still checks membership at runtime.
			this.children.insertAtEnd(item as never);
		}
	}

	return Group;
}

/**
 * The group refers back to all contributed items, including itself.
 * Capture the lazy composition here, but do not evaluate it until the application finishes composing.
 */
const groupComponent = ((lazyComposition) => {
	// Both contribution lookup and the component-specific export must return the same schema class.
	const groupSchema = Component.memoize(() => createGroupSchema(lazyComposition()));
	return {
		items: () => [groupSchema],
		groupSchema,
	};
}) satisfies Component.Factory<ItemComponent>;

// #endregion

// #region Application consumers: select libraries, compose once, then create the view

describe("Component library walkthrough", () => {
	it("constructs and edits a recursive model through the composed libraries", () => {
		const composition = Component.compose([groupComponent, textComponent]);
		const Group = composition.getComponent(groupComponent).groupSchema();
		const TextItem = composition.getComponent(textComponent).textSchema();
		const applicationFactory = new SchemaFactory("com.example.components.app");
		class Root extends applicationFactory.object("Root", { group: Group }) {}

		// View configuration evaluates schema references, so it belongs after composition, not inside a component factory.
		const view = independentView(new TreeViewConfiguration({ schema: Root }));
		view.initialize({ group: Group.create() });
		const nestedGroup = Group.create();
		const text = TextItem.create();
		text.attach(Group.create());
		nestedGroup.add(text);
		view.root.group.add(nestedGroup);

		// An editor can populate its creation menu from the selected libraries rather than hard-coding item types.
		// Each menu entry supplies its own factory, so selecting it can create an item to add to the group.
		const menu = composition.getComposed("items").map((getSchema) => getSchema());
		assert.deepEqual(
			menu.map((schema) => schema.description),
			["Group", "Text"],
		);
		const textOption = menu.find((schema) => schema.description === "Text");
		assert(textOption !== undefined);
		view.root.group.add(textOption.create());
		assert.equal(view.root.group.describe(), "New text, New text");
		assert.equal(view.root.group.children[0], nestedGroup);
		assert(text.attachment instanceof Group);
	});

	it("reuses schemas within a composition, but not across independent compositions", () => {
		// All references within one composition must share schema classes to avoid duplicate identifiers.
		// Separate compositions can select different item types, so reusing a class across them would
		// retain the wrong allowed children. Here only the first composition permits text in groups.
		const first = Component.compose([groupComponent, textComponent]);
		const second = Component.compose([groupComponent]);
		const Group = first.getComponent(groupComponent).groupSchema();
		assert.equal(first.getComponent(groupComponent).groupSchema(), Group);
		assert.equal(first.getComposed("items")[0](), Group);
		assert.notEqual(second.getComponent(groupComponent).groupSchema(), Group);
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
