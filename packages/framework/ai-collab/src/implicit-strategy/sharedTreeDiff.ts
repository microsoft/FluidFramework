/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TreeArrayNode, NodeKind } from "@fluidframework/tree";

import { isTreeMapNode, sharedTreeTraverse } from "./utils.js";

/**
 * Represents a path through a tree of objects.
 * number values represent array indices whereas string values represent object keys.
 *
 * @alpha
 */
export type ObjectPath = (string | number)[];

/**
 * Represents a create operation between two branches of a tree.
 * Meaning that an attribute (a shared tree node) was identified as being created.
 *
 * @alpha
 */
export interface DifferenceCreate {
	type: "CREATE";
	path: ObjectPath;
	value: unknown;
}

/**
 * Represents a remove operation between two branches of a tree.
 * Meaning that an attribute (a shared tree node) was identified as being deleted.
 * When using object ids, removes are idenitified by an object with a given id no longer existing.
 *
 * @alpha
 */
export interface DifferenceRemove {
	type: "REMOVE";
	path: ObjectPath;
	oldValue: unknown;
	objectId?: string | number | undefined;
}

/**
 * Represents a change operation between two branches of a tree.
 * Meaning that an attribute (a shared tree node) was identified as being changed from one value to another.
 *
 * @alpha
 */
export interface DifferenceChange {
	type: "CHANGE";
	path: ObjectPath;
	value: unknown;
	oldValue: unknown;
	objectId?: string | number | undefined;
}

/**
 * Represents a move operation between two branches of a tree.
 * Meaning that an object (shared tree node) was identified as being moved from one index to another based on its unique id.
 *
 * @alpha
 */
export interface DifferenceMove {
	type: "MOVE";
	path: ObjectPath;
	newIndex: number;
	value: unknown;
	objectId?: string | number | undefined;
}

/**
 * Union for all possible difference types.
 *
 * @alpha
 */
export type Difference =
	| DifferenceCreate
	| DifferenceRemove
	| DifferenceChange
	| DifferenceMove;

/**
 * Options for tree diffing.
 * @alpha
 */
export interface Options {
	cyclesFix: boolean;
	useObjectIds?:
		| {
				idAttributeName: string;
		  }
		| undefined;
}

const richTypes = { Date: true, RegExp: true, String: true, Number: true };

/**
 * By default, Object Diff supports cyclical references, but if you are sure that the object has no cycles like parsed JSON
 * you can disable cycles by setting the cyclesFix option to false
 */
const DEFAULT_OPTIONS: Options = { cyclesFix: true };

/**
 * Compares two objects and returns an array of differences between them.
 *
 * @alpha
 */
export function sharedTreeDiff(
	obj: Record<string, unknown> | unknown[],
	newObj: Record<string, unknown> | unknown[],
	options: Options = DEFAULT_OPTIONS,
	_stack: (Record<string, unknown> | unknown[])[] = [],
): Difference[] {
	const diffs: Difference[] = [];
	const isObjArray = isArrayOrTreeArrayNode(obj);
	const isNewObjArray = isArrayOrTreeArrayNode(newObj);

	// If useObjectIds is set, we'll create a map of object ids to their index in the array.
	const oldObjArrayItemIdsToIndex =
		isObjArray === false || options.useObjectIds === undefined
			? new Map<string | number, number>()
			: createObjectArrayItemIdsToIndexMap(obj, options.useObjectIds.idAttributeName);

	const newObjArrayItemIdsToIndex =
		isNewObjArray === false || options.useObjectIds === undefined
			? new Map<string | number, number>()
			: createObjectArrayItemIdsToIndexMap(newObj, options.useObjectIds.idAttributeName);

	const objectKeys = isTreeMapNode(obj) ? obj.keys() : Object.keys(obj);
	// We compare existence and values of all attributes within the old against new object, looking for removals or changes.
	for (const key of objectKeys) {
		const objValue: unknown = isTreeMapNode(obj) ? obj.get(key as string) : obj[key];
		const path = isObjArray ? +key : key;
		// 1. First, check if the key within the old object, exists within the new object. If it doesn't exist this would be an attribute removal.
		if (!(key in newObj)) {
			if (options.useObjectIds === undefined) {
				diffs.push({
					type: "REMOVE",
					path: [path],
					objectId: undefined,
					oldValue: objValue,
				});
				continue;
			}
			// If we're dealing with an object in an array, we can use the object's id to check if it was moved to a new index.
			else if (
				isNewObjArray === true &&
				isObjArray &&
				typeof objValue === "object" &&
				objValue !== null
			) {
				const objectId = objValue[options.useObjectIds.idAttributeName] as
					| string
					| number
					| undefined;
				if (objectId !== undefined && newObjArrayItemIdsToIndex.has(objectId)) {
					// The index no longer exists in the new root object array, however the object that lived at this index actually still exists at a new index.
					// Therefore, this node was moved to a new index.
					diffs.push({
						type: "MOVE",
						path: [path],
						newIndex: newObjArrayItemIdsToIndex.get(objectId) as number,
						value: objValue,
						objectId,
					});
					continue;
				}
				// The object with the given id cannot be found within the new array, therefore it was removed.
				else {
					diffs.push({
						type: "REMOVE",
						path: [path],
						objectId,
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
					objectId: undefined,
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
			(!options.cyclesFix || !_stack.includes(objValue as Record<string, unknown>))
		) {
			if (options.useObjectIds === undefined) {
				const nestedDiffs = sharedTreeDiff(
					objValue as Record<string, unknown> | unknown[],
					newObjValue as Record<string, unknown> | unknown[],
					options,
					options.cyclesFix === true
						? [..._stack, objValue as Record<string, unknown> | unknown[]]
						: [],
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
			// Use Object Id strategy to determine if the objects should be compared for changes
			else {
				const oldObjectId = (objValue as Record<string, unknown>)[
					options.useObjectIds.idAttributeName
				] as string | number | undefined;
				const newObjectId = (newObjValue as Record<string, unknown>)[
					options.useObjectIds.idAttributeName
				] as string | number | undefined;

				if (oldObjectId !== undefined && newObjectId !== undefined) {
					// 2a.1 if the object id's are the same, we can continue a comparison between the two objects.
					if (oldObjectId === newObjectId) {
						const nestedDiffs = sharedTreeDiff(
							objValue as Record<string, unknown> | unknown[],
							newObjValue as Record<string, unknown> | unknown[],
							options,
							options.cyclesFix === true
								? [..._stack, objValue as Record<string, unknown> | unknown[]]
								: [],
						);
						diffs.push(
							...nestedDiffs.map((difference) => {
								difference.path.unshift(path);
								return difference;
							}),
						);
					}
					// 2a.2 The object id's are different, their attributes cannot be compared.
					// We need to find the new index of the object, if it exists in the new array and do a diff comparison.
					else {
						const newIndexOfOldObject = newObjArrayItemIdsToIndex.get(oldObjectId);
						// The object no longer exists in the new array, therefore it was removed.
						if (newIndexOfOldObject === undefined) {
							diffs.push({
								type: "REMOVE",
								path: [path],
								oldValue: objValue,
								objectId: oldObjectId,
							});
						}
						// This object still exists but at a new index within the new array therefore it was moved.
						// At this point we can determine whether a new move is necessary or there is one that will place it at the desired index.
						else {
							diffs.push({
								type: "MOVE",
								path: [path],
								newIndex: newIndexOfOldObject,
								value: objValue,
								objectId: oldObjectId,
							});

							// An object could have been moved AND changed. We need to check for this.
							const nestedDiffs = sharedTreeDiff(
								obj[path] as Record<string, unknown> | unknown[],
								newObj[newIndexOfOldObject] as Record<string, unknown> | unknown[],
								options,
								options.cyclesFix === true
									? [..._stack, objValue as Record<string, unknown> | unknown[]]
									: [],
							);
							diffs.push(
								...nestedDiffs.map((difference) => {
									difference.path.unshift(path);
									return difference;
								}),
							);
						}
					}
				} else {
					const nestedDiffs = sharedTreeDiff(
						objValue as Record<string, unknown> | unknown[],
						newObjValue as Record<string, unknown> | unknown[],
						options,
						options.cyclesFix === true
							? [..._stack, objValue as Record<string, unknown> | unknown[]]
							: [],
					);
					diffs.push(
						...nestedDiffs.map((difference) => {
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
					? // eslint-disable-next-line prefer-template
						objValue + "" === newObjValue + ""
					: // eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						+objValue === +newObjValue)
			)
		) {
			diffs.push({
				path: [path],
				type: "CHANGE",
				value: newObjValue,
				oldValue: objValue,
				objectId:
					options.useObjectIds?.idAttributeName === undefined
						? undefined
						: (newObj[options.useObjectIds.idAttributeName] as string | number | undefined),
			});
		}
	}

	// 3. Finally, we check for new keys in the new object that did not exist in the old object.
	// The existence of new keys may signal new values or moved values.
	const newObjKeys = isTreeMapNode(newObj) ? newObj.keys() : Object.keys(newObj);
	for (const key of newObjKeys) {
		const newObjValue: unknown = isTreeMapNode(newObj)
			? newObj.get(key as string)
			: newObj[key];
		const path = isNewObjArray ? +key : key;

		const isKeyInOldObject = isTreeMapNode(obj)
			? obj.has(key as string)
			: Object.keys(obj).includes(key as string);
		if (!isKeyInOldObject) {
			if (options.useObjectIds === undefined) {
				diffs.push({
					type: "CREATE",
					path: [path],
					value: newObjValue,
				});
			}
			// If we're dealing with an object in an array, we can use the object's id to check if this new index actually
			// contains a prexisting object that was moved from an old index.
			else if (
				isObjArray === true &&
				isNewObjArray === true &&
				typeof newObjValue === "object" &&
				newObjValue !== null
			) {
				const objectId = newObjValue[options.useObjectIds.idAttributeName] as
					| string
					| number
					| undefined;
				if (objectId !== undefined && oldObjArrayItemIdsToIndex.has(objectId)) {
					// The new root object array contains a new index, however the object that lives at this new index previously existed at an old index.
					// Therefore, this object was moved to a new index.
					diffs.push({
						type: "MOVE",
						path: [path],
						newIndex: newObjArrayItemIdsToIndex.get(objectId) as number,
						value: newObjValue,
						objectId,
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
		} else if (options.useObjectIds !== undefined) {
			// If we're dealing with an object in an array, we can use the object's id to check if this EXISTING index
			// houses a new object based on a newly encountered id.
			if (
				isObjArray === true &&
				isNewObjArray === true &&
				typeof newObjValue === "object" &&
				newObjValue !== null
			) {
				const objectId = newObjValue[options.useObjectIds.idAttributeName] as
					| string
					| number
					| undefined;
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

/**
 * Type Guard that determines if a given object is an array of type unknown[] or {@link TreeArrayNode}.
 */
function isArrayOrTreeArrayNode(obj: unknown): obj is unknown[] | TreeArrayNode {
	if (typeof obj === "object" && obj !== null) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const maybeNodeKind: unknown = Object.getPrototypeOf(obj)?.constructor?.kind;
		const isTreeArrayNode = maybeNodeKind === NodeKind.Array;
		return Array.isArray(obj) || isTreeArrayNode;
	}
	return false;
}

/**
 * Helper that creates a map of object ids to their index in an array of objects.
 */
function createObjectArrayItemIdsToIndexMap(
	obj: unknown[],
	idAttributeName: string | number,
): Map<string | number, number> {
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

/**
 * Creates a set of mergeable diffs from a series of diffs produced by {@link sharedTreeDiff}
 * that are using the object ID strategy. These diffs don't need any modifications to be applied to the old object.
 *
 * @alpha
 */
export function createMergableIdDiffSeries(
	oldObject: unknown,
	diffs: Difference[],
	idAttributeName: string | number,
): Difference[] {
	// the final series of diffs that will be returned.
	const finalDiffSeries: Difference[] = [];
	// Diffs that aren't of type 'CHANGE'
	const nonChangeDiffs: Difference[] = [];

	for (const diff of diffs) {
		if (diff.type === "CHANGE") {
			// Changes must be applied before any other diff, ao so they are ordered first.
			finalDiffSeries.push({ ...diff });
		} else {
			nonChangeDiffs.push({ ...diff });
		}
	}

	// Create sets of array diffs grouped by the array they are applying changes to.
	const diffsByArrayUuid = new Map<string, Difference[]>();
	for (const diff of nonChangeDiffs) {
		if (!isDiffOnArray(diff)) {
			continue;
		}

		const arrayUuid = arrayUuidFromPath(diff.path);

		if (diffsByArrayUuid.has(arrayUuid) === false) {
			diffsByArrayUuid.set(arrayUuid, []);
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		diffsByArrayUuid.get(arrayUuid)!.push(diff);
	}

	const shiftIndexesFromMove = (
		diff: DifferenceMove,
		targetArray: unknown[],
		diffAdjustedObjectIndexes: Map<string | number, number>,
		objectId: string | number,
	): void => {
		const sourceIndex = diff.path[diff.path.length - 1] as number;

		if (diff.newIndex > sourceIndex) {
			// This move diff shifts objects it moved over to the left.
			//                                            |----|             |----|
			// e.g. - shift with no length change: [{1}, {2}, {3}, {4}] -> [{2}, {3}, {1}, {4}]
			const minIndex = sourceIndex;
			const maxIndex = diff.newIndex;
			for (const [id, index] of diffAdjustedObjectIndexes.entries()) {
				const shouldIndexBeShifted =
					id !== objectId && index <= maxIndex && index >= minIndex && index - 1 >= 0;
				if (shouldIndexBeShifted) {
					diffAdjustedObjectIndexes.set(id, index - 1);
				}
			}
		} else if (diff.newIndex < sourceIndex) {
			// This move diff shifts objects it moved over to the right.
			//                                       |----|                       |----|
			// e.g. - shift with no length change: [{1}, {2}, {3}, {4}] -> [{3}, {1}, {2}, {4}]
			const minIndex = diff.newIndex;
			const maxIndex = sourceIndex;
			for (const [id, index] of diffAdjustedObjectIndexes.entries()) {
				const shouldIndexBeShifted =
					id !== objectId &&
					index <= maxIndex &&
					index >= minIndex &&
					index + 1 <= targetArray.length;
				if (shouldIndexBeShifted) {
					diffAdjustedObjectIndexes.set(id, index + 1);
				}
			}
		}
	};

	const shiftIndexesFromRemove = (
		diff: DifferenceRemove,
		diffAdjustedObjectIndexes: Map<string | number, number>,
		objectId: string | number,
	): void => {
		const removalIndex = diff.path[diff.path.length - 1] as number;
		for (const [id, index] of diffAdjustedObjectIndexes.entries()) {
			const shouldIndexBeShifted = id !== objectId && index > removalIndex && index - 1 >= 0;
			if (shouldIndexBeShifted) {
				diffAdjustedObjectIndexes.set(id, index - 1);
			}
		}
	};

	const diffsMarkedForRemoval = new Set<Difference>();
	const arrayDiffsMarkedForEndReorder = new Map<string, Difference[]>();

	for (const [arrayUuid, arrayDiffs] of diffsByArrayUuid.entries()) {
		// The prior grouping code ensures that each map value will have atleast 1 diff.
		const targetArray = getTargetObjectFromPath(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			arrayDiffs[0]!.path,
			oldObject as TreeArrayNode,
		) as unknown[];
		const diffAdjustedObjectIndexes: Map<string | number, number> =
			createObjectArrayItemIdsToIndexMap(targetArray, idAttributeName);

		for (const diff of arrayDiffs) {
			if (diff.type === "MOVE") {
				const objectId = (diff.value as Record<string, unknown>)[idAttributeName] as
					| string
					| number;
				const sourceIndex = diff.path[diff.path.length - 1] as number;

				// 1. Prior moves may render the next move redundant.
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const currentAdjustedIndex = diffAdjustedObjectIndexes.get(objectId)!;
				if (currentAdjustedIndex === diff.newIndex) {
					diffsMarkedForRemoval.add(diff);
					continue;
				}
				if (currentAdjustedIndex !== sourceIndex) {
					// A Prior Remove or Move Diff moved the object to a new index, so update the diff source index to point to the new index.
					diff.path[diff.path.length - 1] = currentAdjustedIndex;
				}

				// Handle index shifts
				diffAdjustedObjectIndexes.set(objectId, diff.newIndex);

				// edge case: this MOVE should be applied after some series of creates that we haven't seen.
				if (diff.newIndex > targetArray.length - 1) {
					// It also wont shift any indexes since its moved to the total end of the array,
					// after creations that produce the necessary indexes.
					if (arrayDiffsMarkedForEndReorder.has(arrayUuid) === false) {
						arrayDiffsMarkedForEndReorder.set(arrayUuid, []);
					}
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					arrayDiffsMarkedForEndReorder.get(arrayUuid)!.push(diff);
				} else {
					shiftIndexesFromMove(diff, targetArray, diffAdjustedObjectIndexes, objectId);
				}
			}
			if (diff.type === "REMOVE") {
				const objectId = (diff.oldValue as Record<string, unknown>)[idAttributeName] as
					| string
					| number;
				const targetIndex = diff.path[diff.path.length - 1] as number;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const currentDiffAdjustedIndex = diffAdjustedObjectIndexes.get(objectId)!;
				if (targetIndex !== diffAdjustedObjectIndexes.get(objectId)) {
					// A Prior Remove or Move Diff moved the object to a new index, so update the diff source index to point to the new index.
					diff.path[diff.path.length - 1] = currentDiffAdjustedIndex;
				}

				shiftIndexesFromRemove(diff, diffAdjustedObjectIndexes, objectId);
			}

			// Ignoring 'CREATE' for now.
		}
	}

	for (let i = 0; i < nonChangeDiffs.length; i++) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const diff = nonChangeDiffs[i]!;

		if (diffsMarkedForRemoval.has(diff)) {
			continue;
		}

		const isLastDiffInArraySeries = (currentIndex: number): boolean => {
			if (currentIndex === nonChangeDiffs.length - 1) {
				return true;
			}
			const nextIndex = currentIndex + 1;
			if (nextIndex <= nonChangeDiffs.length - 1) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const diffAfter = nonChangeDiffs[nextIndex]!;

				if (diffsMarkedForRemoval.has(diffAfter)) {
					return isLastDiffInArraySeries(nextIndex + 1);
				}

				const arrayUuidAfter = arrayUuidFromPath(diffAfter.path);
				const arrayUuid = arrayUuidFromPath(diff.path);
				if (arrayUuidAfter === arrayUuid) {
					return false;
				}
			}
			return true;
		};

		if (isDiffOnArray(diff)) {
			const arrayUuid = arrayUuidFromPath(diff.path);
			const endReorderDiffs = arrayDiffsMarkedForEndReorder.get(arrayUuid);
			const isDiffMarkedForReorder = endReorderDiffs?.includes(diff) ?? false;

			if (isDiffMarkedForReorder === false) {
				finalDiffSeries.push(diff);
			}

			if (isLastDiffInArraySeries(i) && endReorderDiffs !== undefined) {
				finalDiffSeries.push(...endReorderDiffs);
			}

			continue;
		}

		finalDiffSeries.push(diff);
	}

	return finalDiffSeries;
}

/**
 * Creates a set of mergeable diffs from a series of diffs produced by {@link sharedTreeDiff}
 * that AREN'T using the object ID strategy. These diffs don't need any modifications to be applied to the old object.
 *
 * @alpha
 */
export function createMergableDiffSeries(diffs: Difference[]): Difference[] {
	// the final series of diffs that will be returned.
	const finalDiffSeries: Difference[] = [];
	// Diffs that aren't of type 'CHANGE'
	const nonChangeDiffs: Difference[] = [];

	for (const diff of diffs) {
		if (diff.type === "CHANGE") {
			// Changes must be applied before any other diff, ao so they are ordered first.
			finalDiffSeries.push({ ...diff });
		} else {
			nonChangeDiffs.push({ ...diff });
		}
	}

	finalDiffSeries.push(...nonChangeDiffs);

	return finalDiffSeries;
}

/**
 * Creates a UUID for the target array from a {@link Difference}'s ${@link ObjectPath}
 */
function arrayUuidFromPath(path: ObjectPath): string {
	return path.length === 1 ? "" : path.slice(0, -1).join("");
}

/**
 * Determines if a given difference is on an array.
 */
export function isDiffOnArray(diff: Difference): boolean {
	return typeof diff.path[diff.path.length - 1] === "number";
}

/**
 * Returns the target object that the given diff should be applied to.
 */
function getTargetObjectFromPath(
	path: ObjectPath,
	object: Record<string, unknown> | TreeArrayNode,
): unknown {
	let targetObject: unknown = object;
	if (path.length > 1) {
		targetObject = sharedTreeTraverse(object, path.slice(0, -1));
	}
	return targetObject;
}
