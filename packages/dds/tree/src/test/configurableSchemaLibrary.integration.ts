/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Example showing an application which uses a configurable schema library
 * to create boxes for different kinds of content without exposing how those boxes store their values.
 *
 * The library accepts child schemas from its callers rather than depending on application-specific types.
 * The application selects notes or strings for one box configuration and numbers for another.
 *
 * Each configuration preserves the selected types for reading values and constructing new content,
 * while an explicitly typed public contract hides the box's stored fields.
 * Distinct, stable scopes let both configurations coexist in one document without schema identifier collisions.
 * The application creates the schema classes once and reuses them across independently initialized documents.
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
	type ErasedNode,
	type ErasedSchema,
} from "@fluidframework/tree/alpha";
import { createIndependentTreeView } from "@fluidframework/tree/beta";

// #region Library contracts: retain the caller's child types without exposing the stored fields

/**
 * A box whose persisted identity includes the caller's scope.
 */
export type Box<Scope extends string, Allowed extends ImplicitAllowedTypes> = ErasedNode<
	{ readonly value: TreeNodeFromImplicitAllowedTypes<Allowed> },
	`com.example.box<${Scope}>.Box`
>;

/**
 * Construction without exposing stored fields.
 */
export interface BoxStatics<Scope extends string, Allowed extends ImplicitAllowedTypes> {
	/** Accepts plain objects for child schemas that support them, not just existing nodes. */
	create(value: InsertableTreeNodeFromImplicitAllowedTypes<Allowed>): Box<Scope, Allowed>;
}

/**
 * The public schema and construction contract.
 */
export type BoxSchema<Scope extends string, Allowed extends ImplicitAllowedTypes> = BoxStatics<
	Scope,
	Allowed
> &
	ErasedSchema<Box<Scope, Allowed>>;

// #endregion

// #region Library implementation: only the child schema and scope vary

/**
 * Creates one configured box schema with identifier `com.example.box<scope>.Box`.
 * Reuse the result and keep the scope stable; configurations that coexist need distinct scopes.
 */
export function createBoxSchema<Scope extends string, Allowed extends ImplicitAllowedTypes>(
	scope: Scope,
	allowed: Allowed,
): BoxSchema<Scope, Allowed> {
	const boxFactory = new SchemaFactory("com.example");
	class BoxImplementation extends boxFactory.object(`box<${scope}>.Box`, {
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

function createBoxesView() {
	const view = createIndependentTreeView(new TreeViewConfiguration({ schema: Root }));
	view.initialize({
		notes: NotesBox.create({ text: "Remember this" }),
		quantity: QuantityBox.create(3),
	});
	return view;
}

describe("Configurable schema library walkthrough", () => {
	it("embeds two configurations and preserves the selected child types", () => {
		const view = createBoxesView();
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
		assert.equal(NotesBox.identifier, "com.example.box<notes>.Box");
		assert.equal(QuantityBox.identifier, "com.example.box<quantity>.Box");

		assert.throws(() => {
			// @ts-expect-error This configuration accepts numbers, not strings.
			QuantityBox.create("not a quantity");
		});
	});

	it("reuses configured schemas without sharing document state", () => {
		const first = createBoxesView();
		const second = createBoxesView();
		assert(Tree.is(first.root.notes, NotesBox));
		assert(Tree.is(second.root.notes, NotesBox));
		assert(Tree.is(first.root.quantity, QuantityBox));
		assert(Tree.is(second.root.quantity, QuantityBox));
		const firstNote = first.root.notes.value;
		const secondNote = second.root.notes.value;
		assert(Tree.is(firstNote, Note));
		assert(Tree.is(secondNote, Note));
		firstNote.text = "Only in the first document";
		assert.equal(secondNote.text, "Remember this");
		first.dispose();
		second.dispose();
	});
});

// #endregion
