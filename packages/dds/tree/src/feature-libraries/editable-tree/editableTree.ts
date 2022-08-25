/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// TODO (other than rework IEditableTree):
// - revisit having array element as a node
// - update docs
import { FieldKey, EmptyKey, NodeData } from "../../tree";
import {
	IEditableForest, TreeNavigationResult, mapCursorField, ITreeSubscriptionCursor, ITreeCursor,
} from "../../forest";
// import { TreeSchemaIdentifier } from "../../schema-stored";
import { brand } from "../../util";

export const editableTreeProxySymbol: unique symbol = Symbol("editable-tree-proxy");

// const typeSymbol: unique symbol = Symbol("editable-tree:type");
// const cursorSymbol: unique symbol = Symbol("editable-tree:cursor");
// const nodeMapSymbol: unique symbol = Symbol("editable-tree:nodeMap");
// const forestSymbol: unique symbol = Symbol("editable-tree:forest");
// const getNode: unique symbol = Symbol("editable-tree:getChildNode");

/**
 * A tree with can be traversed and edited.
 * TODO: rework, support editing.
 */
export interface IEditableTree {
	[key: string]: undefined | IEditableTree | NodeData;
	// readonly .cursor: ITreeSubscriptionCursor;
	// readonly .nodeMap: Map<FieldKey, IEditableTree>;
	// readonly .forest: IEditableForest;
	// get [type](): TreeSchemaIdentifier;
	// [getChildNode]: ((key: FieldKey) => IEditableTree | undefined);
}

const tryMoveDown = (cursor: ITreeSubscriptionCursor, key: FieldKey):
	{ result: TreeNavigationResult; isArray: boolean; } => {
	if (key !== EmptyKey && cursor.length(EmptyKey) && isNaN(Number(key))) {
		return { result: TreeNavigationResult.NotFound, isArray: true };
	}
	let result = cursor.down(key, 0);
	let isArray = false;
	if (result === TreeNavigationResult.NotFound) {
		// reading an array
		result = cursor.down(EmptyKey, Number(key));
	} else {
		isArray = !!cursor.length(EmptyKey);
	}
	return { result, isArray };
};

const getDummyArray = (length: number): undefined[] => {
	const dummy: undefined[] = [];
	for (let i = 0; i < length; i++) {
		dummy.push(undefined);
	}
	return dummy;
};

const getNode =
	(forest: IEditableForest, cursor: ITreeSubscriptionCursor, key: FieldKey): NodeData | IEditableTree | undefined => {
	if (cursor.value !== undefined) {
		return { value: cursor.value, type: cursor.type };
	}
	return proxify(forest, cursor);
};

const cursorToValue =
	(forest: IEditableForest) => (cursor: ITreeCursor): NodeData | IEditableTree | undefined => {
	if (cursor.value !== undefined) {
		const result: NodeData = { ...cursor };
		return result;
	}
	const node = getNode(forest, cursor as ITreeSubscriptionCursor, EmptyKey);
	return node;
};

/**
 * A Proxy handler provides a basic read/write access to the Forest by means of the cursors.
 */
const handler: (forest: IEditableForest, cursor: ITreeSubscriptionCursor) => ProxyHandler<IEditableTree>
	= (forest: IEditableForest, cursor: ITreeSubscriptionCursor) => ({
	get: (target: IEditableTree, key: string | symbol, receiver: IEditableTree): unknown => {
		if (typeof key === "string") {
			const { result, isArray } = tryMoveDown(cursor, brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = getNode(forest, cursor, isArray ? EmptyKey : brand(key));
				cursor.up();
				return node;
			} else if (isArray) {
				switch (key) {
					case "length":
						return cursor.length(EmptyKey);
					default:
						return [][key as keyof []];
				}
			}
		}
		if (key === Symbol.iterator) {
			const data = mapCursorField(cursor, EmptyKey, cursorToValue(forest));
			return data[Symbol.iterator];
		}
		return Reflect.get(target, key, receiver);
	},
	set: (target: IEditableTree, key: string | symbol, value: unknown, receiver: IEditableTree): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: IEditableTree, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			switch (key) {
				case editableTreeProxySymbol:
				case Symbol.iterator:
					return true;
				default:
					return false;
			}
		}
		const { result } = tryMoveDown(cursor, brand(key));
		if (result === TreeNavigationResult.Ok) {
			cursor.up();
			return true;
		}
		return Reflect.has(target, key);
	},
	ownKeys(target: IEditableTree) {
		const length = cursor.length(EmptyKey);
		if (length) {
			return Object.getOwnPropertyNames(getDummyArray(length));
		}
		return [...(cursor.keys as string[]), ...Reflect.ownKeys(target)];
	},
	getOwnPropertyDescriptor(target: IEditableTree, key: string | symbol) {
		if (typeof key === "symbol") {
			if (key === editableTreeProxySymbol) {
				return { configurable: true, enumerable: true, value: key, writable: false };
			}
		} else {
			const { result, isArray } = tryMoveDown(cursor, brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = getNode(forest, cursor, isArray ? EmptyKey : brand(key));
				const descriptor = {
					configurable: true,
					enumerable: true,
					value: node,
					writable: true,
				};
				cursor.up();
				return descriptor;
			}
		}
		return Reflect.getOwnPropertyDescriptor(target, key);
	},
});

function proxify(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): IEditableTree {
	// This unconditionally allocates a new cursor or forks the one if exists.
	// Keep in mind that they must be cleared at some point (e.g. before writing to the forest).
	// It does not modify the cursor.
	const _cursor = cursor ? cursor.fork() : forest.allocateCursor();
	if (!cursor) {
		forest.tryMoveCursorTo(forest.root(forest.rootField), _cursor);
	}
	const newNode: IEditableTree = {};
	const proxy = new Proxy(newNode, handler(forest, _cursor));
	Object.defineProperty(proxy, editableTreeProxySymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: editableTreeProxySymbol,
	});

	return proxy;
}

/**
 * Proxify a Forest to showcase basic interaction scenarios.
 * This function forwards Forest to be proxified to minimize exported signature.
 * @returns {@link IEditableTree} a proxy wrapping the given {@link IEditableForest}.
 */
export function getEditableTree(forest: IEditableForest): IEditableTree {
	return proxify(forest);
}
