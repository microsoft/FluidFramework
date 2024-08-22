import { type TreeArrayNode } from "@fluidframework/tree";
import type * as z from "zod";

import { sharedTreeObjectDiff, type Difference, type DifferenceCreate, type DifferenceRemove, type ObjectPath } from "./sharedTreeObjectDiff.js";


/**
 * Manages the differences between a SharedTree object node and a javascript object and then applies them.
 */
export class SharedTreeObjectIdDiffManager {
	private readonly objectSchema?: z.Schema

	public constructor(params?: {objectSchema?: z.Schema}) {
		this.objectSchema = params?.objectSchema;
	}

	/**
	 * produces a diff between two objects and handles the differences.
	 */
	public compareAndApplyDiffs(obj: Record<string, unknown> | TreeArrayNode, newObj: Record<string, unknown> | unknown[]): void {
		// By validating that the incoming object matches the schema, we can confirm that any property
		// deletions/updates/additions are valid.
		if (this.objectSchema !== undefined) {
			const res = this.objectSchema.safeParse(newObj);
			if (res.success === false) {
				throw new TypeError("Invalid data");
			}
		}

		const differences = sharedTreeObjectDiff(obj as Record<string, unknown>  | unknown[], newObj);

		this.handleDifferences(differences, obj);
	}


	public handleDifferences(diffs: Difference[], objectToUpdate: Record<string, unknown> | TreeArrayNode): void {
		if (diffs === undefined) {
			console.log("no changes");
			return;
		}


		// 1. We apply all change diffs before handling more complex diff types.
		const changeDiffs = diffs.filter((d) => d.type === 'CHANGE');
		for (const changeDiff of changeDiffs) {
			this.applyDiff(changeDiff, objectToUpdate);
		}

		// 2. Now, we must handle MOVE diff's.
		// We'll need to see what happened to not only the node being moved but the one that is being displaced.
		// E.g. if we move node X to index 2, then what happened to node Y at index 2?
		// We'd need to find not the coorsponding diff for node Y and apply it.
		// Finally, we'd need to see what happens to index that node X was at.
		// If node Y was deleted and the new node at index 1 is an entirely new one, we'll have to handle the scenario.


		for (let i = 0; i < diffs.length; i++) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const currentDiff: Difference = diffs[i]!;

			this.applyDiff(currentDiff, objectToUpdate);

			// Edge case: If we process an array diff we need to adjust the
			// array indexes for the given array for the rest of the diffs
			if (currentDiff.type === 'REMOVE' && this.isDiffOnArray(currentDiff)) {

				for (let j = i + 1; j < diffs.length; j++) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const nextDiff = diffs[j]!;

					// If these are operations on the same array
					if (this.isDiffOnArray(nextDiff) && nextDiff.path.length === currentDiff.path.length) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const nextDiffArrayIndex = nextDiff.path[nextDiff.path.length - 1]! as number;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const currentDiffArrayIndex = currentDiff.path[currentDiff.path.length - 1]! as number;

						// If the current diff deletes an element behind this next diff,
						// we need to adjust the index referenced by the next diff backwards.
						if (nextDiffArrayIndex > currentDiffArrayIndex) {
							nextDiff.path[nextDiff.path.length - 1] = (nextDiffArrayIndex - 1);
						}
					}
				}

			}

			if (currentDiff.type === 'CREATE' && this.isDiffOnArray(currentDiff)) {
				for (let j = i + 1; j < diffs.length; j++) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const nextDiff = diffs[j]!;

					// If these are operations on the same array
					if (this.isDiffOnArray(nextDiff) && nextDiff.path.length === currentDiff.path.length) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const nextDiffArrayIndex = nextDiff.path[nextDiff.path.length - 1]! as number;
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const currentDiffArrayIndex = currentDiff.path[currentDiff.path.length - 1]! as number;

						// If the current diff deletes an element behind this next diff,
						// we need to adjust the index referenced by the next diff backwards.
						if (nextDiffArrayIndex > currentDiffArrayIndex) {
							nextDiff.path[nextDiff.path.length - 1] = (nextDiffArrayIndex + 1);
						}
					}
				}
			}
		}

	}

	/**
	 * Applies a diff to an object.
	 */
	public applyDiff(diff: Difference, objectToUpdate: Record<string, unknown> | TreeArrayNode): void {
		switch (diff.type) {
			case "CREATE": {
				// Add the new property to the object
				// Can introduce strategies here e.g. use node id's or use indexes for an array
				if (this.isDiffOnArray(diff)) {
					this.addToArray(diff, objectToUpdate as TreeArrayNode);
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
					const targetObject = traversePath<Record<string, unknown>>(objectToUpdate, diff.path.slice(0, - 1));
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
					this.removeFromArray(diff, objectToUpdate as TreeArrayNode);
				} else {
					this.removeFromObject(diff, objectToUpdate);
				}
				break;
			}
			// No default
		}
	}


	public isDiffOnArray(diff: Difference): boolean {
		return typeof diff.path[diff.path.length - 1] === 'number';
	}

	public addToObject(diff: DifferenceCreate, objectToUpdate: Record<string, unknown> | TreeArrayNode): void {
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
			const targetObject = traversePath<Record<string, unknown>>(objectToUpdate, diff.path.slice(0, - 1));
			// ADD PROPERTY TO OBJECT.
			if (targetObject === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetObject[diff.path[diff.path.length - 1] as string] = diff.value;
			}
		}
	}

	public removeFromObject(diff: DifferenceRemove, objectToUpdate: Record<string, unknown> | TreeArrayNode): void {
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
			const targetObject = traversePath<Record<string, unknown>>(objectToUpdate, diff.path.slice(0, - 1));
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

	public addToArray(diff: DifferenceCreate, objectToUpdate: TreeArrayNode): void {
		// The object itself is an array.
		if (diff.path.length === 1) {
			const targetArray = objectToUpdate;

			// ADD ARRAY ELEMENT. Should we respect the index or just push to the end?
			// Lets not respect the index for now.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetArray.insertAtEnd(diff.value);
			}
		}
		// We need a reference to the parent array to remove the element.
		else if (diff.path.length > 1) {
			// Traverse to the parent array (which is simply the second to last path element)
			const targetArray = traversePath<TreeArrayNode>(objectToUpdate, diff.path.slice(0, - 1));

			// ADD ARRAY ELEMENT. Should we respect the index or just push to the end?
			// Lets not respect the index for now.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				targetArray.insertAtEnd(diff.value);
			}
		}
	}

	public removeFromArray(diff: DifferenceRemove, objectToUpdate: TreeArrayNode): void {
		// The object itself is an array.
		if (diff.path.length === 1) {
			const targetArray = objectToUpdate;
			// REMOVE ARRAY ELEMENT.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				const valueIndex = targetArray.indexOf(diff.oldValue);
				if (valueIndex === -1) {
					console.warn("Value to remove does not exist in array");
				} else {
					targetArray.removeAt(valueIndex);
				}
			}
		}
		// We need a reference to the parent array to remove the element.
		else if (diff.path.length > 1) {
			// Traverse to the parent array (which is simply the second to last path element)
			const targetArray = traversePath<TreeArrayNode>(objectToUpdate, diff.path.slice(0, - 1));

			// REMOVE ARRAY ELEMENT.
			if (targetArray === undefined) {
				console.warn("Object to update no longer exists");
			} else {
				const valueIndex = targetArray.indexOf(diff.oldValue);
				if (valueIndex === -1) {
					console.warn("Value to remove does not exist in array");
				} else {
					targetArray.removeAt(valueIndex);
				}
			}
		}
	}
}


/**
 * Traverses the provided {@link ObjectPath} on the provided JSON object and returns the value at the end of the path.
 */
export function traversePath<T = unknown>(jsonObject: Record<string, unknown> | unknown[] | TreeArrayNode, path: ObjectPath): T | undefined {
    let current: unknown = jsonObject;

    for (const key of path) {
        if (current === undefined || current === null) {
            return undefined;
        }
        current = current[key];
    }

    return current as T;
}
