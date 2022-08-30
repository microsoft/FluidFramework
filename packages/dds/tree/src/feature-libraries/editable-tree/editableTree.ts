/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FieldKey, EmptyKey, Value } from "../../tree";
import {
	IEditableForest, TreeNavigationResult, mapCursorField, ITreeSubscriptionCursor, ITreeCursor,
} from "../../forest";
import { brand } from "../../util";
import { TreeSchemaIdentifier } from "../../schema-stored";

export const proxySymbol: unique symbol = Symbol("editable-tree proxy");
export const typeSymbol: unique symbol = Symbol("editable-tree type");

/**
 * A tree with can be traversed and edited.
 * TODO: rework, support editing.
 */
export interface IEditableTree<T> {
	[key: string]: EditableTreeNode<T>;
	[typeSymbol]: (key?: FieldKey) => TreeSchemaIdentifier;
}

export type EditableTreeNode<T> = IEditableTree<T> & {
    [P in keyof T]: T[P] extends Value ? T[P] : EditableTreeNode<T[P]>;
};

const helperSymbol: unique symbol = Symbol("editable-tree helper");

class ProxyTarget<T = any> {
	[key: string]: EditableTreeNode<T>;
	[helperSymbol]: TreeHelper;
	constructor(forest: IEditableForest, cursor?: ITreeSubscriptionCursor) {
		this[helperSymbol] = new TreeHelper(forest, cursor);
	}
	[typeSymbol] = (key?: FieldKey) => {
		return this[helperSymbol][typeSymbol](key);
	};
}

class TreeHelper {
	public cursor: ITreeSubscriptionCursor;
	constructor(
		public forest: IEditableForest,
		_cursor?: ITreeSubscriptionCursor,
	) {
		if (!_cursor) {
			this.cursor = forest.allocateCursor();
			forest.tryMoveCursorTo(forest.root(forest.rootField), this.cursor);
		} else {
			this.cursor = _cursor.fork();
		}
	}

	public tryMoveDown = (key: FieldKey):
		{ result: TreeNavigationResult; isArray: boolean; } => {
		if (key !== EmptyKey && this.cursor.length(EmptyKey) && isNaN(Number(key))) {
			return { result: TreeNavigationResult.NotFound, isArray: true };
		}
		let result = this.cursor.down(key, 0);
		let isArray = false;
		if (result === TreeNavigationResult.NotFound) {
			// reading an array
			result = this.cursor.down(EmptyKey, Number(key));
		} else {
			isArray = !!this.cursor.length(EmptyKey);
		}
		return { result, isArray };
	};

	public getDummyArray = (length: number): undefined[] => {
		const dummy: undefined[] = [];
		for (let i = 0; i < length; i++) {
			dummy.push(undefined);
		}
		return dummy;
	};

	public getNodeData = <T>(cursor?: ITreeSubscriptionCursor): Value | EditableTreeNode<T> | undefined => {
		const _cursor = cursor ?? this.cursor;
		if (_cursor.value !== undefined) {
			const result: Value = _cursor.value;
			return result;
		}
		return proxify(this.forest, _cursor);
	};

	public getArrayGreedy = <T>() => {
		const getNodeData = this.getNodeData;
		return mapCursorField(this.cursor, EmptyKey,
			(cursor: ITreeCursor): Value | EditableTreeNode<T> | undefined => {
			return getNodeData(cursor as ITreeSubscriptionCursor);
		});
	};

	[typeSymbol](key?: FieldKey): TreeSchemaIdentifier {
		if (key) {
			const { result } = this.tryMoveDown(key);
			if (result === TreeNavigationResult.Ok) {
				const type = this.cursor.type;
				this.cursor.up();
				return type;
			}
			return brand("");
		}
		return this.cursor.type;
	}
}

/**
 * A Proxy handler provides a basic read/write access to the Forest by means of the cursors.
 */
const handler: ProxyHandler<ProxyTarget> = {
	get: (target: ProxyTarget, key: string | symbol, receiver: ProxyTarget): unknown => {
		const helper = target[helperSymbol];
		if (typeof key === "string") {
			const { result, isArray } = helper.tryMoveDown(brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = helper.getNodeData();
				helper.cursor.up();
				return node;
			} else if (isArray) {
				switch (key) {
					case "length":
						return helper.cursor.length(EmptyKey);
					default:
						return [][key as keyof []];
				}
			}
		}
		if (key === Symbol.iterator) {
			const data = helper.getArrayGreedy();
			return data[Symbol.iterator];
		} else if (key === typeSymbol) {
			return helper[typeSymbol].bind(helper);
		}
		return undefined;
	},
	set: (target: ProxyTarget, key: string | symbol, value: unknown, receiver: ProxyTarget): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: ProxyTarget, key: string | symbol): boolean => {
		const helper = target[helperSymbol];
		if (typeof key === "symbol") {
			switch (key) {
				case proxySymbol:
				case typeSymbol:
				case Symbol.iterator:
					return true;
				default:
					return false;
			}
		}
		const { result } = helper.tryMoveDown(brand(key));
		if (result === TreeNavigationResult.Ok) {
			helper.cursor.up();
			return true;
		}
		return false;
	},
	ownKeys(target: ProxyTarget) {
		const helper = target[helperSymbol];
		const length = helper.cursor.length(EmptyKey);
		if (length) {
			return Object.getOwnPropertyNames(helper.getDummyArray(length));
		}
		return helper.cursor.keys as string[]; // [...(), ...Reflect.ownKeys(target)];
	},
	getOwnPropertyDescriptor(target: ProxyTarget, key: string | symbol) {
		const helper = target[helperSymbol];
		if (typeof key === "symbol") {
			if (key === proxySymbol) {
				return { configurable: true, enumerable: true, value: key, writable: false };
			} else if (key === typeSymbol) {
				return { configurable: true, enumerable: true, value: helper[typeSymbol], writable: false };
			}
		} else {
			const { result } = helper.tryMoveDown(brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = helper.getNodeData();
				const descriptor = {
					configurable: true,
					enumerable: true,
					value: node,
					writable: true,
				};
				helper.cursor.up();
				return descriptor;
			}
		}
		return undefined;
	},
};

function proxify<T>(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): EditableTreeNode<T> {
	// This unconditionally allocates a new cursor or forks the one if exists.
	// Keep in mind that they must be cleared at some point (e.g. before writing to the forest).
	// It does not modify the cursor.
	const proxy = new Proxy(new ProxyTarget<T>(forest, cursor), handler);
	Object.defineProperty(proxy, proxySymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: proxySymbol,
	});

	return proxy as unknown as EditableTreeNode<T>;
}

// /**
//  * Proxify a Forest to showcase basic interaction scenarios.
//  * This is just a wrapper to minimize exported signature.
//  * @returns {@link IEditableTree} a proxy for the given {@link IEditableForest}.
//  */
export function getEditableTree<T = unknown>(forest: IEditableForest): EditableTreeNode<T> {
	return proxify<T>(forest);
}
