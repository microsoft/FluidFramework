/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeLeafValue } from "@fluidframework/tree";

/**
 * TODO: only 100 object fields total are allowed by OpenAI right now, so larger schemas will fail faster if we have a bunch of schema types generated for type-specific edits.
 *
 * TODO: experiment using https://github.com/outlines-dev/outlines (and maybe a llama model) to avoid many of the annoyances of OpenAI's JSON Schema subset.
 *
 * TODO: without field count limits, we could generate a schema for valid paths from the root object to any field, but it's not clear how useful that would be.
 *
 * TODO: Add a prompt suggestion API!
 *
 * TODO: Could encourage the model to output more technical explanations of the edits (e.g. "insert a new Foo after "Foo2").
 *
 * TODO: Get explanation strings from o1.
 *
 * TODO: Handle rate limit errors.
 *
 * TODO: Separate system prompt into [system, user, system] for security.
 *
 * TODO: Structured Output fails when multiple schema types have the same first field name (e.g. id: sf.identifier on multiple types).
 *
 * TODO: Pass descriptions from schema metadata to the generated TS types that we put in the prompt
 *
 * TODO make the Ids be "Vector-2" instead of "Vector2" (or else it gets weird when you have a type called "Vector2")
 */

/**
 * The base interface for all types of {@link TreeEdit}.
 */
export interface Edit {
	type: "setField" | "insertIntoArray" | "removeFromArray" | "moveArrayElement";
}

/**
 * This is the field we force the LLM to generate to avoid any type ambiguity (e.g. a vector and a point both have x/y and are ambiguous without the LLM telling us which it means).
 */
export const typeField = "__schemaType";

/**
 * A field that is  auto-generated and injected into nodes before passing data to the LLM to ensure the LLM can refer to nodes in a stable way.
 */
export const objectIdKey = "__objectId";

/**
 * TODO
 */
export const objectIdType = "ObjectId";

/**
 * An object being inserted (via an insertion or modification edit) into a tree.
 */
export interface TreeContentObject {
	[key: string]: TreeContent | undefined;
	[typeField]: string;
	[objectIdKey]?: string;
}
/**
 * An array of {@link TreeContentObject}'s, allowing a single {@link TreeEdit} to contain edits to multiple fields.
 */
export type TreeContentArray = TreeContent[];

/**
 * New content inside a `SetField` or `InsertIntoArray` edit.
 */
export type TreeContent = TreeContentObject | TreeContentArray | TreeLeafValue;

/**
 * Union type representing all possible types of edits that can be made to a tree.
 */
export type TreeEdit = InsertIntoArray | SetField | RemoveFromArray | MoveArrayElement;

/**
 * Points to an object in the tree via its ID.
 * `ObjectPointer` should always be preferred to point to an object,
 * though `PathPointer` allows pointing to an array or primitive when needed.
 */
export type ObjectPointer = string;

/**
 * Points to an object in the tree via a path.
 * The path starts either at an object (via ID) or the root of the tree (via null).
 * When possible, paths should always be relative to an object ID.
 */
// eslint-disable-next-line @rushstack/no-new-null
export type PathPointer = [null | ObjectPointer, ...(string | number)[]];

/**
 * Represents a location in the JSON object tree.
 * Either a pointer to an object via ID or a path to an element (can be object, array, or primitive) via path.
 */
export type Pointer = ObjectPointer | PathPointer;

/**
 * Describes an absolute location within an array.
 */
export interface AbsoluteArrayPointer {
	array: PathPointer; // The array containing the element
	index: number | "end"; // The index of the element in the array
}

/**
 * Describes a location within an array relative to an existing array element.
 */
export type RelativeArrayPointer =
	| { after: ObjectPointer } // Position after the referenced element
	| { before: ObjectPointer }; // Position before the referenced element

/**
 * Typeguard for AbsoluteArrayPointer
 */
export function isAbsolute(
	arrayPointer: AbsoluteArrayPointer | RelativeArrayPointer,
): arrayPointer is AbsoluteArrayPointer {
	return "array" in arrayPointer;
}

/**
 * Describes a location within an array.
 */
export type ArrayElementPointer = AbsoluteArrayPointer | RelativeArrayPointer;

/**
 * Defines a range within an array.
 */
export interface ArrayRange {
	from: ArrayElementPointer; // Start of range (inclusive)
	to: ArrayElementPointer; // End of range (inclusive)
}

/**
 * Typeguard for ArrayRange
 */
export function isArrayRange(value: unknown): value is ArrayRange {
	return (
		typeof value === "object" &&
		value !== null &&
		"from" in value &&
		typeof value.from === "object" &&
		"to" in value &&
		typeof value.to === "object"
	);
}

/**
 * Set a field on an object to a specified value.
 * Can be used set optional fields to undefined.
 */
export interface SetField extends Edit {
	type: "setField";
	object: ObjectPointer; // The parent object
	field: string; // The field name to set
	value: TreeContent | undefined; // The value to set
}

/**
 * Add new element(s) to an array.
 * Only one of `value` or `values` should be set.
 */
export interface InsertIntoArray extends Edit {
	type: "insertIntoArray";
	position: ArrayElementPointer; // Where to add the element(s)
	value?: TreeContent; // Value to add, or...
	values?: TreeContent[]; // Array of values to add
}

/**
 * Remove element(s) from an array.
 * Supports removing a single element or a range.
 * Only one of `element` or `range` should be set.
 */
export interface RemoveFromArray extends Edit {
	type: "removeFromArray";

	// For removing a single element
	element?: Pointer; // The element to remove

	// For removing a range
	range?: ArrayRange;
}

/**
 * Move a value from one location to another array
 */
export interface MoveArrayElement extends Edit {
	type: "moveArrayElement";

	// Source can be a single element or a range
	source: ObjectPointer | ArrayRange;

	// Destination must be an array position
	destination: ArrayElementPointer; // Where to place the element(s) in the array
}
