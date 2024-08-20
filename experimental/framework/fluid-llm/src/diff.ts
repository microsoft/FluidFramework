/* eslint-disable jsdoc/require-jsdoc */
export type ObjectPath = (string | number)[];


export interface DifferenceCreate {
	type: "CREATE";
	path: ObjectPath;
	value: unknown;
}

export interface DifferenceRemove {
	type: "REMOVE";
	path: ObjectPath;
	oldValue: unknown;
}

export interface DifferenceChange {
	type: "CHANGE";
	path: ObjectPath;
	value: unknown;
	oldValue: unknown;
}

export type Difference = DifferenceCreate | DifferenceRemove | DifferenceChange;

interface Options {
	cyclesFix: boolean;
}

const richTypes = { Date: true, RegExp: true, String: true, Number: true };

/**
 * Compares two objects and returns an array of differences between them.
 */
export function diff(
	obj: Record<string, unknown> | unknown[],
	newObj: Record<string, unknown> | unknown[],
	// eslint-disable-next-line unicorn/no-object-as-default-parameter
	options: Partial<Options> = { cyclesFix: true },
	_stack: Record<string, unknown>[] = [],
): Difference[] {
	const diffs: Difference[] = [];
	const isObjArray = Array.isArray(obj);

	for (const key of Object.keys(obj)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const objKey = obj[key];
		const path = isObjArray ? +key : key;
		if (!(key in newObj)) {
			diffs.push({
				type: "REMOVE",
				path: [path],
				oldValue: obj[key],
			});
			continue;
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newObjKey = newObj[key];
		const areCompatibleObjects =
			typeof objKey === "object" &&
			typeof newObjKey === "object" &&
			Array.isArray(objKey) === Array.isArray(newObjKey);
		if (
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			objKey &&
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			newObjKey &&
			areCompatibleObjects &&

			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
			!richTypes[Object.getPrototypeOf(objKey)?.constructor?.name] &&
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			(!(options.cyclesFix ?? false) || !_stack.includes(objKey))
		) {
			const nestedDiffs = diff(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				objKey,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				newObjKey,
				options,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/strict-boolean-expressions
				options.cyclesFix ? [..._stack, objKey] : [],
			);
			// eslint-disable-next-line prefer-spread
			diffs.push.apply(
				diffs,
				nestedDiffs.map((difference) => {
					difference.path.unshift(path);
					return difference;
				}),
			);
		} else if (
			objKey !== newObjKey &&
			// treat NaN values as equivalent
			!(Number.isNaN(objKey) && Number.isNaN(newObjKey)) &&
			!(
				areCompatibleObjects &&
				(Number.isNaN(objKey)
					// eslint-disable-next-line prefer-template
					? objKey + "" === newObjKey + ""
					: +objKey === +newObjKey)
			)
		) {
			diffs.push({
				path: [path],
				type: "CHANGE",
				value: newObjKey,
				oldValue: objKey,
			});
		}
	}

	const isNewObjArray = Array.isArray(newObj);
	for (const key of Object.keys(newObj)) {
		if (!(key in obj)) {
			diffs.push({
 				type: "CREATE",
				path: [isNewObjArray ? +key : key],
				value: newObj[key],
			});
		}
	}
	return diffs;
}



export function diffState(oldVal: unknown, newVal: unknown): Difference[] {
	const valueType = typeof oldVal;
	if (valueType !== typeof newVal) {
		throw new TypeError("old and new values are not of the same primitive type");
	}

	const diffs: Difference[] = [];
	switch (valueType) {
		case "boolean":
		case "number": {
			const newDiff = simplePrimitiveCompare(oldVal, newVal, valueType);
			if (newDiff) {
				diffs.push(newDiff);
			}
			return diffs;
		}
		case "string": {
			const newDiff = simplePrimitiveCompare(oldVal, newVal, 'string');
			if (newDiff) {
				diffs.push(newDiff);
			}
			return diffs;
		}
		case "object": {
			// we assume this is a JSON object.
			return diff(oldVal as Record<string, unknown>, newVal as Record<string, unknown>);
		}
		default: {
			throw new Error("unsupported value type.");
		}
	}
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function simplePrimitiveCompare<T>(oldVal: T, newVal: T, type: "boolean" | "string" | "number"): Difference | undefined {
	if (oldVal !== newVal) {
		return {type: "CHANGE", oldValue: oldVal, value: newVal, path: []};
	}
	return undefined
}
