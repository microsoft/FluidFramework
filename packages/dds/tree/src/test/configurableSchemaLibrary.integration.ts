/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	Tree,
	TreeViewConfiguration,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
} from "@fluidframework/tree";
import {
	eraseSchemaDetails,
	independentView,
	type ErasedNode,
	type ErasedSchema,
} from "@fluidframework/tree/alpha";

// #region Library contracts: retain the caller's child types without exposing the stored fields

/** Domain operations on a box configured with the caller's allowed child schemas. */
export interface BoxMembers<Allowed extends ImplicitAllowedTypes> {
	readonly value: TreeNodeFromImplicitAllowedTypes<Allowed>;
}

/** The scope is part of the node's persisted identity. */
export type Box<Scope extends string, Allowed extends ImplicitAllowedTypes> = ErasedNode<
	BoxMembers<Allowed>,
	`com.example.box.${Scope}.Box`
>;

/** Construction accepts insertable content, which differs from an existing node's readable type. */
export interface BoxStatics<Scope extends string, Allowed extends ImplicitAllowedTypes> {
	create(value: InsertableTreeNodeFromImplicitAllowedTypes<Allowed>): Box<Scope, Allowed>;
}

/** Explicit factory return types keep the implementation class out of the library's declarations. */
export type BoxSchema<Scope extends string, Allowed extends ImplicitAllowedTypes> = BoxStatics<
	Scope,
	Allowed
> &
	ErasedSchema<Box<Scope, Allowed>>;

// #endregion

// #region Library implementation: only the child schema and scope vary

const boxFactory = new SchemaFactory("com.example.box");

/**
 * Creates one configured box schema with identifier `com.example.box.<scope>.Box`.
 * The caller must reuse the result and keep its scope stable when reopening documents.
 * Distinct configurations that coexist in one schema need distinct scopes.
 * See schemaErasure.integration.ts for a fixed library's explicit export boundary.
 */
export function createBoxSchema<Scope extends string, Allowed extends ImplicitAllowedTypes>(
	scope: Scope,
	allowed: Allowed,
): BoxSchema<Scope, Allowed> {
	class BoxImplementation extends boxFactory.object(`${scope}.Box`, {
		content: boxFactory.required(allowed),
	}) {
		public get value(): TreeNodeFromImplicitAllowedTypes<Allowed> {
			return this.content;
		}

		public static create(
			value: InsertableTreeNodeFromImplicitAllowedTypes<Allowed>,
		): BoxImplementation {
			return new BoxImplementation({ content: value });
		}
	}

	return eraseSchemaDetails<Box<Scope, Allowed>, BoxStatics<Scope, Allowed>>()(
		BoxImplementation,
	);
}

// #endregion

// #region Application consumers: configure once and distribute the resulting schemas

describe("Configurable schema library walkthrough", () => {
	it("embeds two configurations and preserves the selected child types", () => {
		const applicationFactory = new SchemaFactory("com.example.boxes.app");
		class Note extends applicationFactory.object("Note", {
			text: applicationFactory.string,
		}) {}

		const NotesBox = createBoxSchema("notes", [Note, applicationFactory.string] as const);
		const QuantityBox = createBoxSchema("quantity", applicationFactory.number);
		class Root extends applicationFactory.object("Root", {
			notes: NotesBox,
			quantity: QuantityBox,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: Root }));
		// The factory accepts the child schema's insertable object, not just already-constructed nodes.
		view.initialize({
			notes: NotesBox.create({ text: "Remember this" }),
			quantity: QuantityBox.create(3),
		});
		const note = view.root.notes.value;
		assert(Tree.is(note, Note));
		note.text = "Updated note";
		assert.equal(note.text, "Updated note");
		const quantity: number = view.root.quantity.value;
		assert.equal(quantity, 3);
		assert.equal(
			NotesBox.create("Plain text is allowed too").value,
			"Plain text is allowed too",
		);
		assert.equal(NotesBox.identifier, "com.example.box.notes.Box");
		assert.equal(QuantityBox.identifier, "com.example.box.quantity.Box");

		assert.throws(() => {
			// @ts-expect-error This configuration accepts numbers, not strings.
			QuantityBox.create("not a quantity");
		});
	});
});

// #endregion
