import type * as z from "zod";

import {
	objectDiff,
	type Difference,
	type DifferenceCreate,
	type DifferenceRemove,
	type ObjectPath,
} from "./objectDiff.js";

/**
 * Manages the differences between two simple javascript objects.
 */
export class SimpleObjectDiffManager {
	private readonly objectSchema?: z.Schema;

	public constructor(params?: { objectSchema?: z.Schema }) {
		this.objectSchema = params?.objectSchema;
	}

	/**
	 * produces a diff between two objects and handles the differences.
	 */
	public compareAndApplyDiffs(
		obj: Record<string, unknown> | unknown[],
		newObj: Record<string, unknown> | unknown[],
	): void {
		// By validating that the incoming object matches the schema, we can confirm that any property
		// deletions/updates/additions are valid.
		if (this.objectSchema !== undefined) {
			const res = this.objectSchema.safeParse(newObj);
			if (res.success === false) {
				throw new TypeError("Invalid data");
			}
		}

		const differences = objectDiff(obj, newObj);

		this.handleDifferences(differences, obj);
	}

	public handleDifferences(
		diff: Difference[],
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		if (diff === undefined) {
			console.log("no changes");
			return;
		}

		/**
		 * Edge case: If the diff is a change to an object in an array, we'll have to consider how to handle it. Does it have an id?
		 * If it has the id, we find and use that to delete the node rather than using the index. However, if not, do
		 * we just go off of the index? Lets discuss w/ team. If not, we need to enfore objects having an id field.
		 */

		/**
		 * Edge case: What if the diff is a removal of a property on an object? SharedTree seemingly doesn't support this so what do we do?
		 */

		// Simple diff's that change a variable can be applied directly thanks to the shared tree json object proxy.

		// Should this merge class even mention ST if we're using object proxies?

		for (let i = 0; i < diff.length; i++) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const currentDiff: Difference = diff[i]!;

			this.applyDiff(currentDiff, objectToUpdate);

			// Edge case: If we process an array diff we need to adjust the
			// array indexes for the given array for the rest of the diffs
			if (currentDiff.type === "REMOVE" && this.isDiffOnArray(currentDiff)) {
				for (let j = i + 1; j < diff.length; j++) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const nextDiff = diff[j]!;

					// If these are operations on the same array
					if (
						this.isDiffOnArray(nextDiff) &&
						nextDiff.path.length === currentDiff.path.length
					) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const nextDiffArrayIndex = nextDiff.path[nextDiff.path.length - 1]! as number;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const currentDiffArrayIndex = currentDiff.path[
							currentDiff.path.length - 1
						]! as number;

						// If the current diff deletes an element behind this next diff,
						// we need to adjust the index referenced by the next diff backwards.
						if (nextDiffArrayIndex > currentDiffArrayIndex) {
							nextDiff.path[nextDiff.path.length - 1] = nextDiffArrayIndex - 1;
						}
					}
				}
			}

			if (currentDiff.type === "CREATE" && this.isDiffOnArray(currentDiff)) {
				for (let j = i + 1; j < diff.length; j++) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const nextDiff = diff[j]!;

					// If these are operations on the same array
					if (
						this.isDiffOnArray(nextDiff) &&
						nextDiff.path.length === currentDiff.path.length
					) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const nextDiffArrayIndex = nextDiff.path[nextDiff.path.length - 1]! as number;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const currentDiffArrayIndex = currentDiff.path[
							currentDiff.path.length - 1
						]! as number;

						// If the current diff deletes an element behind this next diff,
						// we need to adjust the index referenced by the next diff backwards.
						if (nextDiffArrayIndex > currentDiffArrayIndex) {
							nextDiff.path[nextDiff.path.length - 1] = nextDiffArrayIndex + 1;
						}
					}
				}
			}
		}
	}

	/**
	 * Applies a diff to an object.
	 */
	public applyDiff(
		diff: Difference,
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		switch (diff.type) {
			case "CREATE": {
				// Add the new property to the object
				// Can introduce strategies here e.g. use node id's or use indexes for an array
				if (this.isDiffOnArray(diff)) {
					this.addToArray(diff, objectToUpdate);
				} else {
					this.addToObject(diff, objectToUpdate);
				}
				break;
			}
			case "CHANGE": {
				// Change the value of the property
				// A change is always going to be a change to a property on an object.
				if (diff.path.length === 1) {
					// The object itself is the object to update.
					const targetObject = objectToUpdate as Record<string, unknown>;
					// CHANGE PROPERTY TO OBJECT.
					if (targetObject === undefined) {
						console.warn("Object to update no longer exists");
					} else {
						targetObject[diff.path[0] as string] = diff.value;
					}
				} else {
					const targetObject = traversePath<Record<string, unknown>>(
						objectToUpdate,
						diff.path.slice(0, -1),
					);
					// CHANGE PROPERTY TO OBJECT.
					if (targetObject === undefined) {
						console.warn("Object to update no longer exists");
					} else {
						targetObject[diff.path[diff.path.length - 1] as string] = diff.value;
					}
				}
				break;
			}
			case "REMOVE": {
				if (this.isDiffOnArray(diff)) {
					this.removeFromArray(diff, objectToUpdate);
				} else {
					this.removeFromObject(diff, objectToUpdate);
				}
				break;
			}
			// No default
		}
	}

	public isDiffOnArray(diff: Difference): boolean {
		return typeof diff.path[diff.path.length - 1] === "number";
	}

	public addToObject(
		diff: DifferenceCreate,
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		if (diff.path.length === 1) {
			// The object itself is the object to update.
			const targetObject = objectToUpdate as Record<string, unknown>;
			// ADD PROPERTY TO OBJECT.
			if (targetObject === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetObject[diff.path[0] as string] = diff.value;
			}
		} else {
			const targetObject = traversePath<Record<string, unknown>>(
				objectToUpdate,
				diff.path.slice(0, -1),
			);
			// ADD PROPERTY TO OBJECT.
			if (targetObject === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetObject[diff.path[diff.path.length - 1] as string] = diff.value;
			}
		}
	}

	public removeFromObject(
		diff: DifferenceRemove,
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		if (diff.path.length === 1) {
			// The object itself is the object to update.
			const targetObject = objectToUpdate as Record<string, unknown>;
			// DELETE PROPERTY TO OBJECT.
			if (targetObject === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				if (targetObject[diff.path[0] as string] === undefined) {
					console.warn("Property to remove does not exist");
				} else {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete targetObject[diff.path[0] as string];
				}
			}
		} else {
			const targetObject = traversePath<Record<string, unknown>>(
				objectToUpdate,
				diff.path.slice(0, -1),
			);
			// DELETE PROPERTY TO OBJECT.
			if (targetObject === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				if (targetObject[diff.path[diff.path.length - 1] as string] === undefined) {
					console.warn("Property to remove does not exist");
				} else {
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete targetObject[diff.path[diff.path.length - 1] as string];
				}
			}
		}
	}

	public addToArray(
		diff: DifferenceCreate,
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		// The object itself is an array.
		if (diff.path.length === 1) {
			const targetArray = objectToUpdate as unknown[];

			// ADD ARRAY ELEMENT. Should we respect the index or just push to the end?
			// Lets not respect the index for now.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetArray.push(diff.value);
			}

			// ALTERNATE STRATEGY: Use object id's to determine whether the object exists and if not, it should be added
			// This might not make sense for new object additions.
		}
		// We need a reference to the parent array to remove the element.
		else if (diff.path.length > 1) {
			// Traverse to the parent array (which is simply the second to last path element)
			const targetArray = traversePath<unknown[]>(objectToUpdate, diff.path.slice(0, -1));

			// ADD ARRAY ELEMENT. Should we respect the index or just push to the end?
			// Lets not respect the index for now.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetArray.push(diff.value);
			}

			// ALTERNATE STRATEGY: Use object id's to determine whether the object should be added
			// This might not make sense for new object additions.
		}
	}

	public removeFromArray(
		diff: DifferenceRemove,
		objectToUpdate: Record<string, unknown> | unknown[],
	): void {
		// The object itself is an array.
		if (diff.path.length === 1) {
			const targetArray = objectToUpdate as unknown[];

			// REMOVE ARRAY ELEMENT.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				const valueIndex = targetArray.indexOf(diff.oldValue);
				if (valueIndex === -1) {
					console.warn("Value to remove does not exist in array");
				} else {
					targetArray.splice(valueIndex, 1);
				}
			}

			// ALTERNATE REMOVAL STRATEGY: Use object's id to find the right index and remove it only if it exists.
		}
		// We need a reference to the parent array to remove the element.
		else if (diff.path.length > 1) {
			// Traverse to the parent array (which is simply the second to last path element)
			const targetArray = traversePath<unknown[]>(objectToUpdate, diff.path.slice(0, -1));

			// REMOVE ARRAY ELEMENT.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				const valueIndex = targetArray.indexOf(diff.oldValue);
				if (valueIndex === -1) {
					console.warn("Value to remove does not exist in array");
				} else {
					targetArray.splice(valueIndex, 1);
				}
			}

			// ALTERNATE REMOVAL STRATEGY: Use object's id to find the right index and remove it only if it exists.
		}
	}
}

/**
 * Traverses the provided {@link ObjectPath} on the provided JSON object and returns the value at the end of the path.
 */
export function traversePath<T = unknown>(
	jsonObject: Record<string, unknown> | unknown[],
	path: ObjectPath,
): T | undefined {
	let current: unknown = jsonObject;

	for (const key of path) {
		if (current === undefined || current === null) {
			return undefined;
		}
		current = current[key];
	}

	return current as T;
}
