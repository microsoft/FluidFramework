/* eslint-disable jsdoc/require-jsdoc */

import { type TreeArrayNode, NodeKind } from "@fluidframework/tree";

import { isTreeMapNode } from "./utils.js";

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

export interface DifferenceMove {
	type: "MOVE";
	path: ObjectPath;
	newIndex: number;
	value: unknown;
}

export type Difference = DifferenceCreate | DifferenceRemove | DifferenceChange | DifferenceMove;

interface Options {
	cyclesFix: boolean;
	useObjectIds?: {
		idAttributeName: string;
	}
}

const richTypes = { Date: true, RegExp: true, String: true, Number: true }

/**
 * By default, Object Diff supports cyclical references, but if you are sure that the object has no cycles like parsed JSON
 * you can disable cycles by setting the cyclesFix option to false
 */
 const DEFAULT_OPTIONS: Options = { cyclesFix: true };

/**
 * Compares two objects and returns an array of differences between them.
 */
export function sharedTreeObjectDiff(
	obj: Record<string, unknown> | unknown[],
	newObj: Record<string, unknown> | unknown[],
	options: Options = DEFAULT_OPTIONS,
	_stack: (Record<string, unknown> | unknown[])[] = [],
): Difference[] {

	const diffs: Difference[] = [];
	const isObjArray = isArrayOrTreeArrayNode(obj);
	const isNewObjArray = isArrayOrTreeArrayNode(newObj);

	// If useObjectIds is set, we'll create a map of object ids to their index in the array.
	const oldObjArrayItemIdsToIndex = (isObjArray === false || options.useObjectIds === undefined)
	? new Map<string | number, number>()
	: createObjectArrayItemIdsToIndexMap(obj, options.useObjectIds.idAttributeName);

	const newObjArrayItemIdsToIndex = (isNewObjArray === false || options.useObjectIds === undefined)
	 ? new Map<string | number, number>()
	 : createObjectArrayItemIdsToIndexMap(newObj, options.useObjectIds.idAttributeName);

	 const objectKeys = isTreeMapNode(obj) ? obj.keys() : Object.keys(obj);
	// We compare existence and values of all attributes within the old against new object, looking for removals or changes.
	for (const key of objectKeys) {
		const objValue: unknown = isTreeMapNode(obj) ? obj.get(key as string): obj[key];
		const path = isObjArray ? +key : key;
		// 1. First, check if the key within the old object, exists within the new object. If it doesn't exist this would be an attribute removal.
		if (!(key in newObj)) {
			if (options.useObjectIds === undefined) {
				diffs.push({
					type: "REMOVE",
					path: [path],
					oldValue: objValue,
				});
				continue;
			}
			// If we're dealing with an object in an array, we can use the object's id to check if it was moved to a new index.
			else if (isNewObjArray === true && isObjArray && typeof objValue === 'object' && objValue !== null) {
				const objectId = objValue[options.useObjectIds.idAttributeName] as string | number | undefined;
				if (objectId !== undefined && newObjArrayItemIdsToIndex.has(objectId)) {
					// The index no longer exists in the new root object array, however the object that lived at this index actually still exists at a new index.
					// Therefore, this node was moved to a new index.
					diffs.push({
						type: "MOVE",
						path: [path],
						newIndex: newObjArrayItemIdsToIndex.get(objectId) as number,
						value: objValue
					});
					continue;
				}
				// The object with the given id cannot be found within the new array, therefore it was removed.
				else {
					diffs.push({
						type: "REMOVE",
						path: [path],
						oldValue: objValue,
					});
					continue;
				}
			}
			// If we're not dealing with an object in an array, we can't use id's to check for a move.
			// We'll assume that a missing key in the new object means that the cooresponding value was removed.
			else {
				diffs.push({
					type: "REMOVE",
					path: [path],
					oldValue: objValue,
				});
				continue;
			}
		}

		const newObjValue: unknown = newObj[key];
		const areCompatibleObjects =
			typeof objValue === "object" &&
			typeof newObjValue === "object" &&
			isArrayOrTreeArrayNode(objValue) === isArrayOrTreeArrayNode(newObjValue);

		// 2a. If the given old object key exists in the new object, and the value of said key in both objects is ANOTHER nested object, we need to run a recursive diff check on them.
		if (
			objValue !== null &&
			newObjValue !== null &&
			areCompatibleObjects &&
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
			!richTypes[Object.getPrototypeOf(objValue)?.constructor?.name] &&
			(!(options.cyclesFix) || !_stack.includes(objValue as Record<string, unknown>))
		) {

			if (options.useObjectIds === undefined) {
				const nestedDiffs = sharedTreeObjectDiff(
					objValue as Record<string, unknown> | unknown[],
					newObjValue as Record<string, unknown> | unknown[],
					options,
					options.cyclesFix === true ? [..._stack, objValue as Record<string, unknown> | unknown[]] : [],
				);
				// eslint-disable-next-line prefer-spread
				diffs.push.apply(
					diffs,
					nestedDiffs.map((difference) => {
						difference.path.unshift(path);
						return difference;
					}),
				);
			}
			else {
				const oldObjectId = (objValue as Record<string, unknown>)[options.useObjectIds.idAttributeName] as string | number | undefined;
				const newObjectId = (newObjValue as Record<string, unknown>)[options.useObjectIds.idAttributeName] as string | number | undefined;

				if (oldObjectId !== undefined && newObjectId !== undefined) {
					// if the object id's are the same, we can continue a comparison between the two objects.
					if (oldObjectId === newObjectId) {
						const nestedDiffs = sharedTreeObjectDiff(
							objValue as Record<string, unknown> | unknown[],
							newObjValue as Record<string, unknown> | unknown[],
							options,
							options.cyclesFix === true ? [..._stack, objValue as Record<string, unknown> | unknown[]] : [],
						);
						// eslint-disable-next-line prefer-spread
						diffs.push.apply(
							diffs,
							nestedDiffs.map((difference) => {
								difference.path.unshift(path);
								return difference;
							}),
						);
					}
					// The object id's are different, their attributes cannot be compared.
					// We need to find the new index of the object, if it exists in the new array and do a diff comparison.
					else {
						const oldObjectNewIndex = newObjArrayItemIdsToIndex.get(oldObjectId);
						// The object no longer exists in the new array, therefore it was removed.
						if (oldObjectNewIndex === undefined) {
							diffs.push({
								type: "REMOVE",
								path: [path],
								oldValue: objValue,
							});
						}
						// This object still exists in a new location within the new array therefore it was moved.
						else {
							diffs.push({
								type: "MOVE",
								path: [path],
								newIndex: oldObjectNewIndex,
								value: objValue
							});

							// An object could have been moved AND changed. We need to check for this.
							const nestedDiffs = sharedTreeObjectDiff(
								obj[path] as Record<string, unknown> | unknown[],
								newObj[oldObjectNewIndex] as Record<string, unknown> | unknown[],
								options,
								options.cyclesFix === true ? [..._stack, objValue as Record<string, unknown> | unknown[]] : [],
							);
							// eslint-disable-next-line prefer-spread
							diffs.push.apply(
								diffs,
								nestedDiffs.map((difference) => {
									difference.path.unshift(path);
									return difference;
								}),
							);
						}
					}
				} else {
					const nestedDiffs = sharedTreeObjectDiff(
						objValue as Record<string, unknown> | unknown[],
						newObjValue as Record<string, unknown> | unknown[],
						options,
						options.cyclesFix === true ? [..._stack, objValue as Record<string, unknown> | unknown[]] : [],
					);
					// eslint-disable-next-line prefer-spread
					diffs.push.apply(
						diffs,
						nestedDiffs.map((difference) => {
							difference.path.unshift(path);
							return difference;
						}),
					);
				}

			}
		}
		// 2b. If the given old object key exists in the new object, and the value of said key in both objects is NOT another nested object, we need to check if the values are the same.
		else if (
			objValue !== newObjValue &&
			// treat NaN values as equivalent
			!(Number.isNaN(objValue) && Number.isNaN(newObjValue)) &&
			!(
				areCompatibleObjects &&
				(Number.isNaN(objValue)
					// eslint-disable-next-line prefer-template
					? objValue + "" === newObjValue + ""
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					: +objValue === +newObjValue)
			)
		) {
			diffs.push({
				path: [path],
				type: "CHANGE",
				value: newObjValue,
				oldValue: objValue,
			});
		}
	}

	// 3. Finally, we check for new keys in the new object that did not exist in the old object.
	// The existence of new keys may signal new values or moved values.
	const newObjKeys = isTreeMapNode(newObj) ? newObj.keys() : Object.keys(newObj);
	for (const key of newObjKeys) {
		const newObjValue: unknown = isTreeMapNode(newObj) ? newObj.get(key as string): newObj[key];
		const path = isNewObjArray ? +key : key;

		const isKeyInOldObject = isTreeMapNode(obj) ? obj.has(key as string) : key in obj;
		if (!(isKeyInOldObject)) {

			if (options.useObjectIds === undefined) {
				diffs.push({
					type: "CREATE",
				   path: [path],
				   value: newObjValue,
			   });
			}
			// If we're dealing with an object in an array, we can use the object's id to check if this new index actually
			// contains a prexisting object that was moved from an old index.
			else if (isObjArray === true && isNewObjArray === true && typeof newObjValue === 'object' &&  newObjValue !== null) {
				const objectId = newObjValue[options.useObjectIds.idAttributeName] as string | number | undefined;
				if (objectId !== undefined && oldObjArrayItemIdsToIndex.has(objectId)) {
					// The new root object array contains a new index, however the object that lives at this new index previously existed at an old index.
					// Therefore, this object was moved to a new index.
					diffs.push({
						type: "MOVE",
						path: [path],
						newIndex: newObjArrayItemIdsToIndex.get(objectId) as number,
						value: newObjValue
					});
					continue;
				}
				// If either the object's id attribute does not exist or the original array does not contain an object with the given id
				// Then we assume this was a newly created object.
				else {
					diffs.push({
						type: "CREATE",
					   path: [path],
					   value: newObjValue,
				   });
				}
			}
			// If we're not dealing with an object in an array, we can't use id's to check for a move.
			// We'll assume that a brand new key and value pair in the new object means that a new value was created.
			else {
				diffs.push({
					type: "CREATE",
				   path: [path],
				   value: newObjValue,
			   });
			}
		}

		else if (options.useObjectIds !== undefined) {
			// If we're dealing with an object in an array, we can use the object's id to check if this EXISTING index
			// houses a new object based on a newly encountered id.
			if (isObjArray === true && isNewObjArray === true && typeof newObjValue === 'object' && newObjValue !== null) {
				const objectId = newObjValue[options.useObjectIds.idAttributeName] as string | number | undefined;
				// If this object has an id and it does not exist in the old array, then it was created.
				if (objectId !== undefined && oldObjArrayItemIdsToIndex.has(objectId) === false) {
					diffs.push({
						type: "CREATE",
						path: [path],
						value: newObjValue,
				   });
				}
			} else {
				continue;
			}
		}
	}
	return diffs;
}

function isArrayOrTreeArrayNode(obj: unknown): obj is unknown[] | TreeArrayNode {
	if (typeof obj === 'object' && obj !== null) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const maybeNodeKind: unknown = Object.getPrototypeOf(obj)?.constructor?.kind;
		const isTreeArrayNode = maybeNodeKind === NodeKind.Array;
		return Array.isArray(obj) || isTreeArrayNode;
	}
	return false;
}

function createObjectArrayItemIdsToIndexMap(obj: unknown[], idAttributeName: string | number): Map<string | number, number> {
	const objArrayItemIdsToIndex = new Map<string | number, number>();
	for (let i = 0; i < obj.length; i++) {
		const objArrayItem = obj[i];
		if (typeof objArrayItem === "object" && objArrayItem !== null) {
			const id = (objArrayItem as Record<string, unknown>)[idAttributeName] as string | number;
			if (objArrayItemIdsToIndex.has(id)) {
				throw new TypeError(`Duplicate object id found: ${id}`);
			} else if (id !== undefined) {
				objArrayItemIdsToIndex.set(id, i);
			}
		}
	}

	return objArrayItemIdsToIndex;
}
