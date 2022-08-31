/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FieldKey, EmptyKey, TreeValue } from "../../tree";
import {
	IEditableForest, TreeNavigationResult, mapCursorField, ITreeSubscriptionCursor, ITreeCursor,
} from "../../forest";
import { brand } from "../../util";
import { TreeSchemaIdentifier, NamedTreeSchema } from "../../schema-stored";

export const proxySymbol: unique symbol = Symbol("editable-tree proxy");

/**
 * A unique Symbol to get a method of {@link EditableTree} which returns a type of a node or its children.
 *
 * One can call `foo[getTypeSymbol]("bar")` to get a type of `bar` or
 * without a field name i.e. `foo.bar[getTypeSymbol]()` for the same if `bar` is a non-primitive.
 */
export const getTypeSymbol: unique symbol = Symbol("editable-tree getType");

export type EditableTreeNodeSchema = Partial<NamedTreeSchema>;

/**
 * This is a basis type for {@link EditableTree}.
 *
 * New features like e.g. to get an iterator over node's fields should be defined here
 * and for each and every new method its own symbol should be created correspondingly.
 * This prevents accidental mixin with user-defined string keys.
 */
export interface EditableTreeSignature<T> {
	[key: string]: T extends number | string | boolean ? TreeValue : EditableTreeNode<T>;
	readonly [key: symbol]: ((key?: FieldKey, withSchema?: boolean) => EditableTreeNodeSchema);
	readonly [getTypeSymbol]: (key?: FieldKey) => EditableTreeNodeSchema;
}

/**
 * This converts a type T into an {@link EditableTree} node or a primitive.
 */
export type EditableTreeNode<T> = {
	[P in keyof T]?: T[P] extends number | string | boolean ? TreeValue : EditableTree<T[P]>;
};

/**
 * A tree which can be traversed and edited.
 * TODO: support editing.
 */
export type EditableTree<T = any> = EditableTreeSignature<T> & EditableTreeNode<T>;

class ProxyTarget {
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
		{ result: TreeNavigationResult; isArray: boolean; hasNodes: boolean; } => {
		if (key !== EmptyKey && this.cursor.length(EmptyKey) && isNaN(Number(key))) {
			return { result: TreeNavigationResult.NotFound, isArray: true, hasNodes: true };
		}
		let result = this.cursor.down(key, 0);
		let isArray = false;
		if (result === TreeNavigationResult.NotFound) {
			// reading an array
			result = this.cursor.down(EmptyKey, Number(key));
		} else {
			isArray = !!this.cursor.length(EmptyKey);
		}
		const hasNodes = !!(this.cursor.keys as string[]).length;
		return { result, isArray, hasNodes };
	};

	public getDummyArray = (length: number): undefined[] => {
		const dummy: undefined[] = [];
		for (let i = 0; i < length; i++) {
			dummy.push(undefined);
		}
		return dummy;
	};

	public getNodeData = <T>(cursor?: ITreeSubscriptionCursor): TreeValue | EditableTreeNode<T> | undefined => {
		const _cursor = cursor ?? this.cursor;
		const hasNoNodes = !(_cursor.keys as string[]).length;
		if (_cursor.value !== undefined || hasNoNodes) {
			const result: TreeValue = _cursor.value;
			return result;
		}
		return proxify<T>(this.forest, _cursor);
	};

	public getArrayGreedy = <T>() => {
		const getNodeData = this.getNodeData;
		return mapCursorField(this.cursor, EmptyKey,
			(cursor: ITreeCursor): TreeValue | EditableTreeNode<T> | undefined => {
			return getNodeData(cursor as ITreeSubscriptionCursor);
		});
	};

	[getTypeSymbol](key?: FieldKey, withSchema: boolean = false): EditableTreeNodeSchema {
		let name: TreeSchemaIdentifier;
		if (key === undefined) {
			name = this.cursor.type;
		} else {
			const { result } = this.tryMoveDown(key);
			if (result === TreeNavigationResult.Ok) {
				name = this.cursor.type;
				this.cursor.up();
			} else {
				return { name: brand("") };
			}
		}
		const schema: EditableTreeNodeSchema = withSchema
			? { name, ...this.forest.schema.lookupTreeSchema(name) }
			: { name };
		return schema;
	}
}

/**
 * A Proxy handler together with a {@link ProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const handler: ProxyHandler<ProxyTarget> = {
	get: (target: ProxyTarget, key: string | symbol, receiver: ProxyTarget): unknown => {
		if (typeof key === "string") {
			const { result, isArray } = target.tryMoveDown(brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = target.getNodeData();
				target.cursor.up();
				return node;
			} else if (isArray) {
				switch (key) {
					case "length":
						return target.cursor.length(EmptyKey);
					default:
						return [][key as keyof []];
				}
			}
		}
		if (key === Symbol.iterator) {
			const data = target.getArrayGreedy();
			return data[Symbol.iterator];
		} else if (key === getTypeSymbol) {
			return target[getTypeSymbol].bind(target);
		}
		return undefined;
	},
	set: (target: ProxyTarget, key: string, value: unknown, receiver: ProxyTarget): boolean => {
		throw new Error("Not implemented.");
	},
	deleteProperty: (target: ProxyTarget, key: string): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: ProxyTarget, key: string | symbol): boolean => {
		if (typeof key === "symbol") {
			switch (key) {
				case proxySymbol:
				case getTypeSymbol:
				case Symbol.iterator:
					return true;
				default:
					return false;
			}
		}
		const { result } = target.tryMoveDown(brand(key));
		if (result === TreeNavigationResult.Ok) {
			target.cursor.up();
			return true;
		}
		return false;
	},
	ownKeys(target: ProxyTarget) {
		const length = target.cursor.length(EmptyKey);
		if (length) {
			return Object.getOwnPropertyNames(target.getDummyArray(length));
		}
		return target.cursor.keys as string[];
	},
	getOwnPropertyDescriptor(target: ProxyTarget, key: string | symbol) {
		if (typeof key === "symbol") {
			if (key === proxySymbol) {
				return { configurable: true, enumerable: true, value: key, writable: false };
			} else if (key === getTypeSymbol) {
				return { configurable: true, enumerable: true, value: target[getTypeSymbol], writable: false };
			}
		} else {
			const { result } = target.tryMoveDown(brand(key));
			if (result === TreeNavigationResult.Ok) {
				const node = target.getNodeData();
				const descriptor = {
					configurable: true,
					enumerable: true,
					value: node,
					writable: true,
				};
				target.cursor.up();
				return descriptor;
			}
		}
		return undefined;
	},
};

function proxify<T>(forest: IEditableForest, cursor?: ITreeSubscriptionCursor): EditableTree<T> {
	// This unconditionally allocates a new cursor or forks the one if exists.
	// Keep in mind that they must be cleared at some point (e.g. before writing to the forest).
	// It does not modify the cursor.
	const proxy: unknown = new Proxy(new ProxyTarget(forest, cursor), handler);
	Object.defineProperty(proxy, proxySymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: proxySymbol,
	});

	return proxy as EditableTree<T>;
}

/**
 * A simple API for a Forest to showcase basic interaction scenarios.
 *
 * This function returns an instance of a JS Proxy typed as an EditableTree.
 * Use built-in JS functions to get more information about the data stored e.g.
 * ```
 * const data = getEditableTree(forest);
 * for (const key of Object.keys(data)) { ... }
 * // OR
 * if ("foo" in data) { ... }
 * ```
 *
 * Not (yet) supported: create properties, set values and delete properties.
 *
 * @returns {@link EditableTree} for the given {@link IEditableForest}.
 */
export function getEditableTree<T = any>(forest: IEditableForest): EditableTree<T> {
	return proxify<T>(forest);
}
