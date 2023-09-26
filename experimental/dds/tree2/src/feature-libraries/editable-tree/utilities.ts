/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { isStableId } from "@fluidframework/container-runtime";
import {
	FieldKey,
	TreeStoredSchema,
	UpPath,
	getDetachedFieldContainingPath,
	rootField,
} from "../../core";
import { brand } from "../../util";
import { valueSymbol } from "../contextuallyTyped";
import { FieldKinds } from "../default-field-kinds";
import { StableNodeKey } from "../node-key";
import { getField } from "../untypedTree";
import { EditableTree, TreeStatus } from "./editableTreeTypes";

/**
 * @returns true iff `schema` trees should default to being viewed as just their value when possible.
 *
 * @remarks
 * This may return true for some types which EditableTree does not unwrap to just their value,
 * since EditableTree avoids ever unwrapping primitives that are objects
 * so users checking for primitives by type won't be broken.
 * Checking for this object case is done elsewhere.
 * @alpha
 */
export function isPrimitive(schema: TreeStoredSchema): boolean {
	// TODO: use a separate `ITreeSchema` type, with metadata that determines if the type is primitive.
	// Since the above is not done yet, use use a heuristic:
	return (
		schema.leafValue !== undefined &&
		schema.structFields.size === 0 &&
		schema.mapFields === undefined
	);
}

/**
 * Variant of ProxyHandler covering when the type of the target and implemented interface are different.
 * Only the parts needed so far are included.
 */
export interface AdaptingProxyHandler<T extends object, TImplements extends object> {
	// apply?(target: T, thisArg: any, argArray: any[]): any;
	// construct?(target: T, argArray: any[], newTarget: Function): object;
	// defineProperty?(target: T, p: string | symbol, attributes: PropertyDescriptor): boolean;
	deleteProperty?(target: T, p: string | symbol): boolean;
	get?(target: T, p: string | symbol, receiver: unknown): unknown;
	getOwnPropertyDescriptor?(target: T, p: string | symbol): PropertyDescriptor | undefined;
	// getPrototypeOf?(target: T): object | null;
	has?(target: T, p: string | symbol): boolean;
	// isExtensible?(target: T): boolean;
	ownKeys?(target: T): ArrayLike<keyof TImplements>;
	// preventExtensions?(target: T): boolean;
	set?(target: T, p: string | symbol, value: unknown, receiver: unknown): boolean;
	// setPrototypeOf?(target: T, v: object | null): boolean;
}

export function adaptWithProxy<From extends object, To extends object>(
	target: From,
	proxyHandler: AdaptingProxyHandler<From, To>,
): To {
	// Proxy constructor assumes handler emulates target's interface.
	// Ours does not, so this cast is required.
	return new Proxy<From>(target, proxyHandler as ProxyHandler<From>) as unknown as To;
}

export function getOwnArrayKeys(length: number): string[] {
	return Object.getOwnPropertyNames(Array.from(Array(length)));
}

export function keyIsValidIndex(key: string | number, length: number): boolean {
	const index = Number(key);
	if (typeof key === "string" && String(index) !== key) return false;
	return Number.isInteger(index) && 0 <= index && index < length;
}

/**
 * Retrieve a {@link StableNodeKey} on the given {@link EditableTree} node.
 * @param nodeKeyFieldKey - the key of the field under which the node key resides
 * @param node - the {@link EditableTree} node from which to retrieve the node key
 * @returns the {@link StableNodeKey} on `node`, or undefined if there is none.
 */
export function getStableNodeKey(
	nodeKeyFieldKey: FieldKey,
	node: EditableTree,
): StableNodeKey | undefined {
	if (nodeKeyFieldKey in node) {
		// Get the ID via a wrapped node rather than an unwrapped node (`node[nodeKeyFieldKeySymbol]`)
		// so that the field kind can be checked
		const field = node[getField](nodeKeyFieldKey);
		assert(
			field.fieldSchema.kind.identifier === FieldKinds.nodeKey.identifier,
			0x6df /* Invalid node key field kind */,
		);
		const nodeKeyNode = field.getNode(0);
		const id = nodeKeyNode[valueSymbol];
		assert(
			typeof id === "string" && isStableId(id),
			0x6e0 /* Malformed value encountered in node key field */,
		);
		return brand(id);
	}
}

/**
 * Checks the path and returns the TreeStatus based on whether or not the detached field is the root field.
 * TODO: Performance: This is a slow initial implementation which traverses the entire path up to the root of the tree.
 * This should eventually be optimized.
 * @param path - the path you want to check
 * @returns the {@link TreeStatus} from the path provided.
 */
export function treeStatusFromPath(path: UpPath): TreeStatus {
	return getDetachedFieldContainingPath(path) === rootField
		? TreeStatus.InDocument
		: TreeStatus.Removed;
}
