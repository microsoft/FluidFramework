/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICombiningOp } from "./ops";

export interface MapLike<T> {
	[index: string]: T;
}

// We use any because when you include custom methods
// such as toJSON(), JSON.stringify accepts most types other
// than functions
export type PropertySet = MapLike<any>;

// Assume these are created with Object.create(null)

export interface IConsensusValue {
	seq: number;
	value: any;
}

export function combine(
	combiningInfo: ICombiningOp,
	currentValue: any,
	newValue: any,
	seq?: number,
) {
	let _currentValue = currentValue;

	if (_currentValue === undefined) {
		_currentValue = combiningInfo.defaultValue;
	}
	// Fixed set of operations for now

	switch (combiningInfo.name) {
		case "incr":
			_currentValue += newValue as number;
			if (combiningInfo.minValue) {
				if (_currentValue < combiningInfo.minValue) {
					_currentValue = combiningInfo.minValue;
				}
			}
			break;
		case "consensus":
			if (_currentValue === undefined) {
				const cv: IConsensusValue = {
					value: newValue,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					seq: seq!,
				};

				_currentValue = cv;
			} else {
				const cv = _currentValue as IConsensusValue;
				if (cv.seq === -1) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					cv.seq = seq!;
				}
			}
			break;
		default:
			break;
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return _currentValue;
}

export function matchProperties(a: PropertySet | undefined, b: PropertySet | undefined) {
	let entriesA;
	let entriesB;
	if (!a && !b) {
		return true;
	}
	if (a) {
		entriesA = Object.entries(a);
	}
	if (b) {
		entriesB = Object.entries(b);
	}

	if (a && entriesA.length > 0) {
		if (!b || entriesB.length === 0) {
			return false;
		} else {
			// For now, straightforward; later use hashing
			for (const [key, value] of entriesA) {
				if (b[key] === undefined) {
					return false;
				} else if (typeof b[key] === "object") {
					if (!matchProperties(value, b[key])) {
						return false;
					}
				} else if (b[key] !== value) {
					return false;
				}
			}

			// eslint-disable-next-line no-restricted-syntax
			for (const key in b) {
				if (a[key] === undefined) {
					return false;
				}
			}
		}
	} else {
		if (b && entriesB.length > 0) {
			return false;
		}
	}

	return true;
}

export function extend<T>(
	base: MapLike<T>,
	extension: MapLike<T> | undefined,
	combiningOp?: ICombiningOp,
	seq?: number,
) {
	if (extension !== undefined) {
		// eslint-disable-next-line guard-for-in, no-restricted-syntax
		for (const key in extension) {
			const v = extension[key];
			if (v === null) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete base[key];
			} else {
				if (combiningOp && combiningOp.name !== "rewrite") {
					base[key] = combine(combiningOp, base[key], v, seq);
				} else {
					base[key] = v;
				}
			}
		}
	}
	if (Object.entries(base).length === 0) {
		return undefined;
	}
	return base;
}

export function clone<T>(extension: MapLike<T> | undefined) {
	if (extension === undefined) {
		return undefined;
	}
	const cloneMap = createMap<T>();
	// eslint-disable-next-line guard-for-in, no-restricted-syntax
	for (const key in extension) {
		const v = extension[key];
		if (v !== null) {
			cloneMap[key] = v;
		}
	}
	return cloneMap;
}

export function addProperties(
	oldProps: PropertySet | undefined,
	newProps: PropertySet,
	op?: ICombiningOp,
	seq?: number,
) {
	let _oldProps = oldProps;
	if (!_oldProps || (op && op.name === "rewrite")) {
		_oldProps = createMap<any>();
	}
	extend(_oldProps, newProps, op, seq);
	return _oldProps;
}

export function extendIfUndefined<T>(base: MapLike<T>, extension: MapLike<T> | undefined) {
	if (extension !== undefined) {
		// eslint-disable-next-line no-restricted-syntax
		for (const key in extension) {
			if (base[key] === undefined) {
				base[key] = extension[key];
			}
		}
	}
	return base;
}

// Create a MapLike with good performance.
export function createMap<T>(): MapLike<T> {
	return Object.create(null) as MapLike<T>;
}
