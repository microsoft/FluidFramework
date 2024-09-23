/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonPrimitive } from "../json-handler/index.js";
import type { typeField } from "./agentEditReducer.js";

/**
 * TODO: The current scheme does not allow manipulation of arrays of primitive values because you cannot refer to them.
 * We could accomplish this via a path (probably JSON Pointer or JSONPath) from a possibly-null objectId, or wrap arrays in an identified object.
 *
 * TODO: We could add a "replace" edit type to avoid tons of little modifies.
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
 * TODO: Abort controller should be wired up to cancel the chain-of-thought edits.
 *
 * TODO: We should have a retry count for top-level API.
 *
 * TODO: Add a prompt suggestion API!
 *
 * TODO: Could encourage the model to output more technical explanations of the edits (e.g. "insert a new Foo after "Foo2").
 *
 * TODO: Could feed LLM errors when it fails to give it a chance to correct itself (e.g. ranges not in same parent error).
 *
 * TODO: Tests of range edits.
 *
 * TODO: SetRoot might be obscure enough to make the LLM avoid it. Maybe a general replace edit would be better.
 */

export const objectIdKey = "__fluid_objectId";

export interface TreeEditObject {
	[key: string]: TreeEditValue;
	[typeField]: string;
}
export type TreeEditArray = TreeEditValue[];
export type TreeEditValue = JsonPrimitive | TreeEditObject | TreeEditArray;

// For polymorphic edits, we need to wrap the edit in an object to avoid anyOf at the root level.
export interface EditWrapper {
	// eslint-disable-next-line @rushstack/no-new-null
	edit: TreeEdit | null;
}

export type TreeEdit = SetRoot | Insert | Modify | Remove | Move;

export interface Edit {
	explanation: string;
	type: "setRoot" | "insert" | "modify" | "remove" | "move";
}

export type Selection = ObjectTarget | Range;

export interface ObjectTarget {
	[objectIdKey]: string;
}

// TODO: Allow support for nested arrays
export interface ArrayPlace {
	type: "arrayPlace";
	parentId: string;
	field: string;
	location: "start" | "end";
}

export interface ObjectPlace extends ObjectTarget {
	type: "objectPlace";
	// No "start" or "end" because we don't have a way to refer to arrays directly.
	place: "before" | "after";
}

export interface Range {
	from: ObjectPlace;
	to: ObjectPlace;
}

export interface SetRoot extends Edit {
	type: "setRoot";
	content: TreeEditValue;
}

export interface Insert extends Edit {
	type: "insert";
	content: TreeEditObject;
	destination: ObjectPlace | ArrayPlace;
}

export interface Modify extends Edit {
	type: "modify";
	target: ObjectTarget;
	field: string;
	modification: TreeEditValue;
}

export interface Remove extends Edit {
	type: "remove";
	source: Selection;
}

export interface Move extends Edit {
	type: "move";
	source: Selection;
	destination: ObjectPlace | ArrayPlace;
}
