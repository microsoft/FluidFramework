/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonPrimitive } from "./jsonTypes.js";

/**
 * TODO: The current scheme does not allow manipulation of arrays of primitive values because you cannot refer to them.
 * We could accomplish this via a path (probably JSON Pointer or JSONPath) from a possibly-null objectId, or wrap arrays in an identified object.
 *
 * TODO: only 100 object fields total are allowed by OpenAI right now, so larger schemas will fail faster if we have a bunch of schema types generated for type-specific edits.
 *
 * TODO: experiment using https://github.com/outlines-dev/outlines (and maybe a llama model) to avoid many of the annoyances of OpenAI's JSON Schema subset.
 *
 * TODO: without field count limits, we could generate a schema for valid paths from the root object to any field, but it's not clear how useful that would be.
 *
 * TODO: We don't supported nested arrays yet.
 *
 * TODO: Could omit edit contents for setRoot edits as the tree state is the result (or the other way around).
 *
 * TODO: Add a prompt suggestion API!
 *
 * TODO: Could encourage the model to output more technical explanations of the edits (e.g. "insert a new Foo after "Foo2").
 *
 * TODO: Get explanation strings from o1.
 *
 * TODO: Tests of range edits.
 *
 * TODO: SetRoot might be obscure enough to make the LLM avoid it. Maybe a general replace edit would be better.
 *
 * TODO: Handle 429 rate limit error in streamFromLlm.
 *
 * TODO: Add an app-specific guidance string.
 *
 * TODO: Give the model a final chance to evaluate the result.
 *
 * TODO: Separate system prompt into [system, user, system] for security.
 *
 * TODO: Top level arrays are not supported with current DSL.
 *
 * TODO: Structured Output fails when multiple schema types have the same first field name (e.g. id: sf.identifier on multiple types).
 *
 * TODO: Pass descriptions from schema metadata to the generated TS types that we put in the prompt
 */

/**
 * TBD
 */
export const typeField = "__fluid_type";
/**
 * TBD
 */
export const objectIdKey = "__fluid_objectId";

/**
 * Describes an edit to a field within a node.
 * @remarks what is the [key: string] for?
 */
export interface TreeEditObject {
	[key: string]: TreeEditValue;
	[typeField]: string;
}
/**
 * An array of {@link TreeEditValue}'s, allowing a single TreeEdit to contain edits to multiple fields.
 */
export type TreeEditArray = TreeEditValue[];

/**
 * The potential values for a given TreeEdit. These values are typically a field within a node or an entire node,
 * represented in JSON because they are expected to be returned by an LLM.
 */
export type TreeEditValue = JsonPrimitive | TreeEditObject | TreeEditArray;

/**
 * This is the the final object we expected from an LLM response.
 * @remarks Because TreeEdit can be multiple different types (polymorphic),
 * we need to wrap to avoid anyOf at the root level when generating the necessary JSON Schema.
 */
export interface EditWrapper {
	// eslint-disable-next-line @rushstack/no-new-null
	edit: TreeEdit | null;
}

/**
 * Union type representing all possible types of edits that can be made to a tree.
 */
export type TreeEdit = SetRoot | Insert | Modify | Remove | Move;

/**
 * The base interface for all types of {@link TreeEdit}.
 */
export interface Edit {
	explanation: string;
	type: "setRoot" | "insert" | "modify" | "remove" | "move";
}

/**
 * This object provides a way to 'select' either a given node or a range of nodes in an array.
 */
export type Selection = ObjectTarget | Range;

/**
 * A Target object for an {@link TreeEdit}, identified by the target object's Id
 */
export interface ObjectTarget {
	target: string;
}

/**
 * Desribes where an object can be inserted into an array.
 * For example, if an you have an array with 5 objects, and you insert an object at index 3, this differentiates whether you want
 * the existing item at index 3 should be shifted forward (if the 'place' is 'before') or shifted backwards (if the 'place' is 'after')
 *
 * @remarks TODO: Allow support for nested arrays
 */
export interface ArrayPlace {
	type: "arrayPlace";
	parentId: string;
	field: string;
	location: "start" | "end";
}

/**
 * Desribes where an object can be inserted into an array.
 * For example, if an you have an array with 5 objects, and you insert an object at index 3, this differentiates whether you want
 * the existing item at index 3 should be shifted forward (if the 'place' is 'before') or shifted backwards (if the 'place' is 'after')
 *
 * @remarks Why does this and {@link ArrayPlace} exist together?
 */
export interface ObjectPlace extends ObjectTarget {
	type: "objectPlace";
	// No "start" or "end" because we don't have a way to refer to arrays directly.
	place: "before" | "after";
}

/**
 * A range of objects within an array. This allows the LLM to select multiple nodes at once,
 * for example during an {@link Remove} operation to remove a range of nodes.
 */
export interface Range {
	from: ObjectPlace;
	to: ObjectPlace;
}

/**
 * Describes an operation to set the root of the tree. This is the only edit that can change the root object.
 */
export interface SetRoot extends Edit {
	type: "setRoot";
	content: TreeEditValue;
}

/**
 * Describes an operation to insert a new node into the tree.
 */
export interface Insert extends Edit {
	type: "insert";
	content: TreeEditObject | JsonPrimitive;
	destination: ObjectPlace | ArrayPlace;
}

/**
 * Describes an operation to modify an existing node in the tree.
 */
export interface Modify extends Edit {
	type: "modify";
	target: ObjectTarget;
	field: string;
	modification: TreeEditValue;
}

/**
 * Describes an operation to remove either a specific node or a range of nodes in an array.
 */
export interface Remove extends Edit {
	type: "remove";
	source: Selection;
}

/**
 * Describes an operation to move a node within an array
 */
export interface Move extends Edit {
	type: "move";
	source: Selection;
	destination: ObjectPlace | ArrayPlace;
}
