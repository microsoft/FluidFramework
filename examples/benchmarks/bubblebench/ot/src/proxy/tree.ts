/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */
import * as json1 from "ot-json1";

const contextSym = Symbol("proxy.context");

type Consumer = (ops: json1.JSONOp) => void;

interface IProxy extends Object {
	[contextSym]: { parent?: IProxy; parentKey: json1.Key };
}

function getPath(target: IProxy, key: json1.Key, path: json1.Key[] = []): json1.Path {
	const { parent, parentKey } = target[contextSym];
	if (parent !== undefined) {
		getPath(parent, parentKey, path);
	}
	path.push(key);
	return path;
}

const cache = new WeakMap<Object, IProxy>();

const arrayPatch = {
	push:
		(target: unknown[], consumer: Consumer, receiver: IProxy) =>
		(...item: json1.Doc[]): number => {
			const path = getPath(receiver, 0);
			path.pop();

			const start = target.length;
			consumer(
				item
					.map((value, index) => json1.insertOp([...path, start + index], value))
					// eslint-disable-next-line unicorn/no-array-reduce, unicorn/no-array-callback-reference
					.reduce(json1.type.compose),
			);
			return target.push(...item);
		},
	pop:
		(target: unknown[], consumer: Consumer, receiver: IProxy) => (): unknown | undefined => {
			const length = target.length;

			if (length > 0) {
				consumer(json1.removeOp(getPath(receiver, length - 1)));
			}

			return target.pop();
		},
};

const createObjectProxy = (
	subject: Object,
	consumer: Consumer,
	parent?: IProxy,
	parentKey?: json1.Key,
): Object => {
	const handler: ProxyHandler<IProxy> = {
		get: (target: IProxy, key: string | symbol, receiver: IProxy) => {
			if (key === contextSym) {
				return { parent, parentKey };
			}

			const value: unknown = target[key];

			return value !== null && typeof value === "object"
				? getProxy(/* target: */ value, consumer, /* parent: */ receiver, key as string)
				: value;
		},
		set: (target: IProxy, key: string | symbol, value: json1.Doc, receiver: IProxy) => {
			const path = getPath(receiver, key as json1.Key);

			if (Object.prototype.hasOwnProperty.call(target, key)) {
				consumer(
					json1.replaceOp(path, /* oldVal: */ target[key] as json1.Doc, /* newVal: */ value),
				);
			} else {
				consumer(json1.insertOp(path, value));
			}

			target[key] = value;
			return true;
		},
	};
	return new Proxy(subject, handler);
};

// If given key is a string containing an integer then convert it to an integer,
// otherwise return the key unmodified.

// Used when proxying an array to undo the Proxy's coercion of numbers to strings.
// This is required because, while the underlying array will accept string as indices,
// the 'ot-json1' uses indexer semantics for numeric paths and property semantics for
// string paths.
function indexify(key: string | symbol): string | symbol | number {
	if (typeof key === "string") {
		const asNumber = +key;
		if (Math.trunc(asNumber) === asNumber) {
			return asNumber;
		}
	}

	return key;
}

const createArrayProxy = (
	subject: Object,
	consumer: Consumer,
	parent?: IProxy,
	parentKey?: json1.Key,
): Object =>
	new Proxy(subject, {
		get: (target: Object, key: string | symbol, receiver: IProxy): unknown => {
			if (key === contextSym) {
				return { parent, parentKey };
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const maybePatch = arrayPatch[key];
			if (maybePatch !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				return maybePatch(target, consumer, receiver);
			}

			// eslint-disable-next-line no-param-reassign
			key = indexify(key as string) as string;
			const value = target[key] as Object;

			return value !== null && typeof value === "object"
				? getProxy(/* target: */ value, consumer, /* parent: */ receiver, key)
				: value;
		},
		set: (
			target: Object,
			key: string | symbol,
			value: json1.Doc,
			receiver: IProxy,
		): boolean => {
			const indexifiedKey = indexify(key as string) as string;
			const path = getPath(receiver, indexifiedKey);

			if (Object.prototype.hasOwnProperty.call(target, indexifiedKey)) {
				consumer(
					json1.replaceOp(
						path,
						/* oldVal: */ target[indexifiedKey] as json1.Doc,
						/* newVal: */ value,
					),
				);
			} else {
				consumer(json1.insertOp(path, value));
			}

			target[indexifiedKey] = value;
			return true;
		},
	});

function getProxy(
	target: Object,
	consumer: Consumer,
	parent?: IProxy,
	parentKey?: json1.Key,
): IProxy {
	let self: IProxy | undefined = cache.get(target);
	if (self === undefined) {
		self = Array.isArray(target)
			? (createArrayProxy(target, consumer, parent, parentKey) as IProxy)
			: (createObjectProxy(target, consumer, parent, parentKey) as IProxy);

		cache.set(target, self);
	}
	return self;
}

export const observe = <T extends Object>(target: T, consumer: Consumer): T =>
	getProxy(target, consumer) as unknown as T;
