/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FieldKey, EmptyKey } from "../../tree";
import {
	IEditableForest, TreeNavigationResult, ITreeSubscriptionCursor, ITreeCursor,
} from "../../forest";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { brand } from "../../util";

export const editableTreeProxySymbol: unique symbol = Symbol("editable-tree-proxy");

const type: unique symbol = Symbol("editable-tree:type");
const cursorSymbol: unique symbol = Symbol("editable-tree:cursor");
const nodeMapSymbol: unique symbol = Symbol("editable-tree:nodeMap");
const forestSymbol: unique symbol = Symbol("editable-tree:forest");
const getChildNode: unique symbol = Symbol("editable-tree:getChildNode");

/**
 * A tree with can be traversed and edited.
 * TODO: support editing.
 */
export interface IEditableTree {
	[key: string]: undefined | IEditableTree;
	readonly [cursorSymbol]: ITreeSubscriptionCursor;
	readonly [nodeMapSymbol]: Map<FieldKey, IEditableTree>;
	readonly [forestSymbol]: IEditableForest;
	get [type](): TreeSchemaIdentifier;
	[getChildNode]: ((key: FieldKey) => IEditableTree | undefined);
}

/**
 * EditableTreeNode is a Proxy target.
 * It holds an instance of an allocated Cursor and its child nodes to traverse the Forest.
 */
class EditableTreeNode implements IEditableTree {
	[key: string]: undefined | IEditableTree;

	readonly [cursorSymbol]: ITreeSubscriptionCursor;
	readonly [nodeMapSymbol]: Map<FieldKey, IEditableTree>;
	readonly [forestSymbol]: IEditableForest;

	constructor(
		forest: IEditableForest,
		cursor?: ITreeSubscriptionCursor,
	) {
		this[forestSymbol] = forest;
		if (cursor) {
			this[cursorSymbol] = cursor.fork();
		} else {
			this[cursorSymbol] = forest.allocateCursor();
			forest.tryMoveCursorTo(forest.root(forest.rootField), this[cursorSymbol]);
		}
		this[nodeMapSymbol] = new Map();
	}

	get [type](): TreeSchemaIdentifier {
		return this[cursorSymbol].type;
	}

	[getChildNode](key: FieldKey): IEditableTree | undefined {
		// It was not implemented to improve performance or for any other "user-related" purpose.
		// Cache might be needed to follow-up all the cursors created.
		// Still an open question if it is a good idea.
		if (!this[nodeMapSymbol].has(key)) {
			const proxy = proxify(this[forestSymbol], this[cursorSymbol]);
			this[nodeMapSymbol].set(key, proxy);
		}
		return this[nodeMapSymbol].get(key);
	}
}

const tryMoveDown = (cursor: ITreeSubscriptionCursor, key: FieldKey):
	{ result: TreeNavigationResult; isArray: boolean; } => {
	if (key !== EmptyKey && cursor.length(EmptyKey) && isNaN(Number(key))) {
		return { result: TreeNavigationResult.NotFound, isArray: true };
	}
	let result = cursor.down(key, 0);
	let isArray = false;
	// TODO make better
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

// The generator returned by this function is required in `for..of` iterations.
// Alternatively one could read a whole array from under the cursor's hood at once beforehand with `mapCursorField`,
// decreasing a probability of having weird side effects if somebody meanwhile changes the cursor.
function getGeneratorForCursor(cursor: ITreeSubscriptionCursor):
	(() => Generator<Partial<ITreeCursor>, void, boolean>) {
	return function* () {
		let result = cursor.down(EmptyKey, 0);
		while (result === TreeNavigationResult.Ok) {
			yield { value: cursor.value, type: cursor.type };
			result = cursor.seek(1);
		}
		cursor.up();
	};
}

/**
 * A Proxy handler provides a basic read/write access to the Forest by means of the cursors.
 */
const handler: ProxyHandler<EditableTreeNode> = {
	get: (target: IEditableTree, key: string | symbol, receiver: IEditableTree): unknown => {
		if (typeof key === "string") {
			const { result, isArray } = tryMoveDown(target[cursorSymbol], brand(key));
			if (result === TreeNavigationResult.Ok) {
				const value = target[cursorSymbol].value === undefined
					? target[getChildNode](isArray ? EmptyKey : brand(key))
					: { value: target[cursorSymbol].value, type: target[cursorSymbol].type };
				target[cursorSymbol].up();
				return value;
			} else if (isArray) {
				switch (key) {
					case "length":
						return target[cursorSymbol].length(EmptyKey);
					default:
						return [][key as keyof []];
				}
			}
		}
		if (key === Symbol.iterator) {
			return getGeneratorForCursor(target[cursorSymbol]);
		}
		return Reflect.get(target, key, receiver);
	},
	set: (target: EditableTreeNode, key: string | symbol, value: unknown): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: EditableTreeNode, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			switch (key) {
				case editableTreeProxySymbol:
				case Symbol.iterator:
					return true;
				default:
					return false;
			}
		}
		const { result } = tryMoveDown(target[cursorSymbol], brand(key));
		if (result === TreeNavigationResult.Ok) {
			target[cursorSymbol].up();
			return true;
		}
		return false;
	},
	ownKeys(target: EditableTreeNode) {
		const length = target[cursorSymbol].length(EmptyKey);
		if (length) {
			return Object.getOwnPropertyNames(getDummyArray(length));
		}
		return target[cursorSymbol].keys as string[];
	},
	getOwnPropertyDescriptor(target: EditableTreeNode, key: string | symbol) {
		if (typeof key === "symbol") {
			if (key === editableTreeProxySymbol) {
				return { configurable: true, enumerable: true, value: key, writable: false };
			}
		} else {
			const { result } = tryMoveDown(target[cursorSymbol], brand(key));
			if (result === TreeNavigationResult.Ok) {
				const value = target[cursorSymbol].value === undefined
					? target[getChildNode](brand(key))
					: { value: target[cursorSymbol].value, type: target[cursorSymbol].type };
				const descriptor = {
					configurable: true,
					enumerable: true,
					value,
					writable: true,
				};
				target[cursorSymbol].up();
				return descriptor;
			}
		}
		return undefined;
	},
};

function proxify(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): IEditableTree {
	// An EditableTreeNode constructor unconditionally allocates a new cursor or forks the one if exists.
	// Keep in mind that they must be cleared at some point (e.g. before writing to the forest).
	// It does not modify the cursor.
	const target = new EditableTreeNode(forest, cursor);
	const proxy = new Proxy(target, handler);
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
