/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FieldKey, EmptyKey } from "../../tree";
import { IEditableForest, TreeNavigationResult, ITreeSubscriptionCursor } from "../../forest";
import { TreeSchemaIdentifier } from "../../schema-stored";

export const proxySymbol = Symbol.for("editable-tree");

export interface IEditableTree {
	get type(): TreeSchemaIdentifier;
}

class ObjectEditableTree implements IEditableTree {
	public readonly cursor: ITreeSubscriptionCursor;
	private readonly _children: Map<string, IEditableTree>;

	constructor(
		public readonly forest: IEditableForest,
		_cursor?: ITreeSubscriptionCursor,
	) {
		if (_cursor) {
			this.cursor = _cursor.fork();
		} else {
			this.cursor = forest.allocateCursor();
			forest.tryMoveCursorTo(forest.root(forest.rootField), this.cursor);
		}
		this._children = new Map();
	}

	public get type(): TreeSchemaIdentifier {
		return this.cursor.type;
	}

	public getChildNode(key: FieldKey): IEditableTree | undefined {
		// It was not implemented to improve performance or for any other "user-related" purpose.
		// Cache might be needed to follow-up all the cursors created.
		// Still an open question if it is a good idea.
		if (!this._children.has(key as string)) {
			const proxy = proxify(this.forest, this.cursor);
			this._children.set(key as string, proxy);
		}
		return this._children.get(key as string);
	}
}

const tryMoveDown = (cursor: ITreeSubscriptionCursor, key: FieldKey):
	{ result: TreeNavigationResult; isArray: boolean; } => {
	let result = cursor.down(key, 0);
	// TODO make better
	let isArray = !!cursor.length(EmptyKey);
	if (result === TreeNavigationResult.NotFound) {
		// maybe an array?
		result = cursor.down(EmptyKey, Number(key));
	} else {
		if (isArray && cursor.down(EmptyKey, 0) === TreeNavigationResult.Ok) {
			cursor.up();
		} else {
			isArray = false;
		}
	}
	return { result, isArray };
};

function accessArrayCursor(cursor: ITreeSubscriptionCursor) {
	return function* () {
		const length = cursor.length(EmptyKey);
		let nextIndex = 0;
		while (nextIndex < length) {
			cursor.down(EmptyKey, nextIndex++);
			const value = cursor.value;
			cursor.up();
			yield value;
		}
	};
}

const handler: ProxyHandler<ObjectEditableTree> = {
	get: (target: ObjectEditableTree, key: string | symbol): any => {
		if (typeof key === "string") {
			const { result, isArray } = tryMoveDown(target.cursor, key as FieldKey);
			if (result === TreeNavigationResult.Ok) {
				const value = target.cursor.value === undefined
					? target.getChildNode(isArray ? EmptyKey : key as FieldKey)
					: target.cursor.value;
				target.cursor.up();
				return value;
			}
		}
		// TODO test
		if (key === Symbol.iterator) {
			return accessArrayCursor(target.cursor);
		}
		return Reflect.get(target, key);
	},
	set: (target: ObjectEditableTree, key: string | symbol, value: any): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: ObjectEditableTree, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			// TODO test
			if (key === proxySymbol) {
				return true;
			} else if (key === Symbol.iterator) {
				return true;
			}
			return false;
		}
		const { result } = tryMoveDown(target.cursor, key as FieldKey);
		if (result === TreeNavigationResult.Ok) {
			target.cursor.up();
			return true;
		}
		return false;
	},
	ownKeys(target: ObjectEditableTree) {
		return target.cursor.keys as string[];
	},
	getOwnPropertyDescriptor(target: ObjectEditableTree, key: string | symbol) {
		if (key === proxySymbol) {
			return { configurable: true, enumerable: true, value: key, writable: false };
		}
		const { result } = tryMoveDown(target.cursor, key as FieldKey);
		if (result === TreeNavigationResult.Ok) {
			const value = target.cursor.value === undefined
				? target.getChildNode(key as FieldKey)
				: target.cursor.value;
			const descriptor = {
				configurable: true,
				enumerable: true,
				value,
				writable: true,
			};
			target.cursor.up();
			return descriptor;
		}
		return undefined;
	},
};

function proxify(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): IEditableTree {
	// A TargetForest constructor unconditionally allocates a new cursor or forks the one if exists.
	// Keep in mind that they must be cleared at some point (e.g. before writing to the forest).
	// It does not modify the cursor.
	const target = new ObjectEditableTree(forest, cursor);
	const proxy = new Proxy(target, handler);
	Object.defineProperty(proxy, proxySymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: proxySymbol,
	});

	return proxy;
}

/**
 * Proxify a Forest to showcase basic interaction scenarios.
 * This function forwards Forest to be proxified to minimize exported signature.
 * It is the only package level export for forestProxy.
 * @returns a proxy wrapping the given {@link IEditableForest}.
 */
export function getEditableTree(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): IEditableTree {
	return proxify(forest, cursor);
}
