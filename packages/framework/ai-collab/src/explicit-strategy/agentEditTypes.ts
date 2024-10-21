/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonPrimitive } from "./json-handler/index.js";

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
 * TBD
 */
export interface TreeEditObject {
	[key: string]: TreeEditValue;
	[typeField]: string;
}
/**
 * TBD
 */
export type TreeEditArray = TreeEditValue[];
/**
 * TBD
 */
export type TreeEditValue = JsonPrimitive | TreeEditObject | TreeEditArray;

/**
 * TBD
 */
// For polymorphic edits, we need to wrap the edit in an object to avoid anyOf at the root level.
export interface EditWrapper {
	// eslint-disable-next-line @rushstack/no-new-null
	edit: TreeEdit | null;
}

/**
 * TBD
 */
export type TreeEdit = SetRoot | Insert | Modify | Remove | Move;

/**
 * TBD
 */
export interface Edit {
	explanation: string;
	type: "setRoot" | "insert" | "modify" | "remove" | "move";
}
/**
 * TBD
 */
export type Selection = ObjectTarget | Range;

/**
 * TBD
 */
export interface ObjectTarget {
	target: string;
}

/**
 * TBD
 */
// TODO: Allow support for nested arrays
export interface ArrayPlace {
	type: "arrayPlace";
	parentId: string;
	field: string;
	location: "start" | "end";
}

/**
 * TBD
 */
export interface ObjectPlace extends ObjectTarget {
	type: "objectPlace";
	// No "start" or "end" because we don't have a way to refer to arrays directly.
	place: "before" | "after";
}

/**
 * TBD
 */
export interface Range {
	from: ObjectPlace;
	to: ObjectPlace;
}

/**
 * TBD
 */
export interface SetRoot extends Edit {
	type: "setRoot";
	content: TreeEditValue;
}

/**
 * TBD
 */
export interface Insert extends Edit {
	type: "insert";
	content: TreeEditObject | JsonPrimitive;
	destination: ObjectPlace | ArrayPlace;
}

/**
 * TBD
 */
export interface Modify extends Edit {
	type: "modify";
	target: ObjectTarget;
	field: string;
	modification: TreeEditValue;
}

/**
 * TBD
 */
export interface Remove extends Edit {
	type: "remove";
	source: Selection;
}

/**
 * TBD
 */
export interface Move extends Edit {
	type: "move";
	source: Selection;
	destination: ObjectPlace | ArrayPlace;
}
