/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FieldKey } from "../../tree";
import { IEditableForest, TreeNavigationResult, ITreeSubscriptionCursor } from "../../forest";

export const proxySymbol = Symbol("forest-proxy");

class TargetForest {
	public readonly cursor: ITreeSubscriptionCursor;

	constructor(
		public readonly forest: IEditableForest,
		cursor?: ITreeSubscriptionCursor,
	) {
		if (cursor) {
			this.cursor = cursor.fork();
		} else {
			this.cursor = forest.allocateCursor();
			forest.tryMoveCursorTo(forest.root(forest.rootField), this.cursor);
		}
	}

	public get type() {
		return this.cursor.type;
	}
}

const handler: ProxyHandler<TargetForest> = {
	get: (target: TargetForest, key: string): any => {
		const result = target.cursor.down(key as FieldKey, 0);
		if (result === TreeNavigationResult.NotFound) {
			return Reflect.get(target, key);
		}
		const value = target.cursor.value;
		if (value === undefined) {
			const childProxy = proxify(target.forest, target.cursor);
			target.cursor.up();
			return childProxy;
		} else {
			target.cursor.up();
			return value;
		}
	},
	set: (target: TargetForest, key: string | symbol, value: any): boolean => {
		throw new Error("Not implemented.");
	},
	has: (target: TargetForest, key: string | symbol): boolean => {
		if (key === proxySymbol) {
			return true;
		}
		const result = target.cursor.down(key as FieldKey, 0);
		if (result === TreeNavigationResult.Ok) {
			target.cursor.up();
			return true;
		}
		return false;
	},
	ownKeys(target: TargetForest) {
		return target.cursor.keys as string[];
	},
	getOwnPropertyDescriptor(target: TargetForest, key: string | symbol) {
		if (key === proxySymbol) {
			return { configurable: true, enumerable: true, value: key, writable: false };
		}
		const result = target.cursor.down(key as FieldKey, 0);
		if (result === TreeNavigationResult.Ok) {
			const descriptor = {
				configurable: true,
				enumerable: true,
				value: target.cursor.value,
				writable: true,
			};
			target.cursor.up();
			return descriptor;
		}
		return undefined;
	},
};

const proxify = (forest: IEditableForest, cursor?: ITreeSubscriptionCursor) => {
	const proxy = new Proxy(new TargetForest(forest, cursor), handler);
	Object.defineProperty(proxy, proxySymbol, {
		enumerable: false,
		configurable: true,
		writable: false,
		value: proxySymbol,
	});

	return proxy;
};

/**
 * Proxify a Forest to showcase basic interaction scenarios.
 * This function forwards Forest to be proxified to minimize exported signature.
 * It is the only package level export for forestProxy.
 * @returns a proxy wrapping the given {@link IEditableForest}.
 */
export const proxifyForest = (forest: IEditableForest) => proxify(forest);
