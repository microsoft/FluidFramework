/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Helper functions and classes to work with ChangeSets with indexed collections (sets and maps)
 */

import { constants, joinPaths } from "@fluid-experimental/property-common";
import cloneDeep from "lodash/cloneDeep.js";
import includes from "lodash/includes.js";
import isEmpty from "lodash/isEmpty.js";
import isEqual from "lodash/isEqual.js";
import isObject from "lodash/isObject.js";
import omit from "lodash/omit.js";
import without from "lodash/without.js";

// @ts-ignore
import { ApplyChangeSetOptions, ConflictInfo, SerializedChangeSet } from "../changeset.js";
import { TypeIdHelper } from "../helpers/typeidHelper.js";
import { PathHelper } from "../pathHelper.js";

import { ConflictType } from "./changesetConflictTypes.js";
import { isEmptyChangeSet } from "./isEmptyChangeset.js";

const { PROPERTY_PATH_DELIMITER, MSG } = constants;

/**
 * @namespace property-changeset.ChangeSetOperations.IndexedCollectionOperations
 * @alias property-changeset.ChangeSetOperations.IndexedCollectionOperations
 * Helper functions and classes to perform operations on ChangeSets with indexed collections (sets and maps)
 */

/**
 * Checks whether an object is empty (has no keys)
 * This function should be a bit faster than the isEmpty from
 * underscore. Unfortunately, at least on Chrome, it is still in
 * O(n)
 *
 * @param in_object - The object to check
 * @returns Is it empty?
 * @private
 */
const _fastIsEmptyObject = function (in_object: any): boolean {
	if (!in_object || Array.isArray(in_object) || !isObject(in_object)) {
		return isEmpty(in_object);
	}

	// eslint-disable-next-line guard-for-in, no-restricted-syntax
	for (const _entry in in_object) {
		return false;
	}

	return true;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ChangeSetIndexedCollectionFunctions {
	/**
	 * Applies a ChangeSet to a given indexed collection property (recursively). The ChangeSet is assumed to be relative
	 * to the same property root and it will be applied behind the base ChangeSet (assuming that the changes are
	 * relative to the state after the base ChangeSet has been applied. It will change the base ChangeSet.
	 *
	 * @param io_basePropertyChanges - The ChangeSet describing the initial state
	 * @param in_appliedPropertyChanges - The ChangeSet to apply to this state
	 * @param in_typeid - The typeid of the contents collection (without the collection type).
	 * @param in_options - Optional additional parameters
	 * @param in_options.applyAfterMetaInformation - Additional meta information which help later to obtain
	 * more compact changeset during the apply operation.
	 *
	 * @private
	 */
	export const _performApplyAfterOnPropertyIndexedCollection = function (
		io_basePropertyChanges: SerializedChangeSet,
		in_appliedPropertyChanges: SerializedChangeSet,
		in_typeid: string,
		in_options: ApplyChangeSetOptions,
	) {
		const isPrimitiveTypeid = TypeIdHelper.isPrimitiveType(in_typeid);

		// Handle remove entry operations
		if (in_appliedPropertyChanges.remove) {
			// Get and initialize the corresponding entries in the existing collection
			let removedEntries = in_appliedPropertyChanges.remove;

			io_basePropertyChanges = io_basePropertyChanges || {};
			io_basePropertyChanges.remove =
				io_basePropertyChanges.remove ||
				(Array.isArray(in_appliedPropertyChanges.remove) ? [] : {});
			let baseInserted = io_basePropertyChanges.insert || {};
			let baseRemoved = io_basePropertyChanges.remove;
			let baseModified = io_basePropertyChanges.modify;
			let done = false;

			if (!Array.isArray(removedEntries)) {
				if (isPrimitiveTypeid) {
					removedEntries = Object.keys(removedEntries);
				} else {
					// this is a reversible change set of templated types
					const removedTypes = Object.keys(removedEntries);
					for (let t = 0; t < removedTypes.length; t++) {
						const removedKeys = Object.keys(removedEntries[removedTypes[t]]);
						for (let i = 0; i < removedKeys.length; i++) {
							if (
								baseInserted[removedTypes[t]] &&
								baseInserted[removedTypes[t]][removedKeys[i]] !== undefined
							) {
								delete baseInserted[removedTypes[t]][removedKeys[i]];

								// If all entries for a typeid have been removed, we can remove
								// the whole typeid from the inserted section
								if (baseInserted && isEmpty(baseInserted[removedTypes[t]])) {
									delete baseInserted[removedTypes[t]];
								}
							} else {
								if (
									baseModified &&
									baseModified[removedTypes[t]] &&
									baseModified[removedTypes[t]][removedKeys[i]] !== undefined
								) {
									delete baseModified[removedTypes[t]][removedKeys[i]];

									// If all entries for a typeid have been removed, we can remove
									// the whole typeid from the inserted section
									if (baseModified && isEmpty(baseModified[removedTypes[t]])) {
										delete baseModified[removedTypes[t]];
									}
								}
								if (Array.isArray(baseRemoved)) {
									baseRemoved.push(removedKeys[i]);
								} else {
									if (!baseRemoved[removedTypes[t]]) {
										baseRemoved[removedTypes[t]] = {};
									}
									baseRemoved[removedTypes[t]][removedKeys[i]] =
										removedEntries[removedTypes[t]][removedKeys[i]];
								}
							}
						}
					}
					done = true;
				}
			}

			if (!done) {
				if (isPrimitiveTypeid) {
					for (let i = 0; i < removedEntries.length; i++) {
						let key = removedEntries[i];

						// If there is an insert for this key, we just remove it
						if (baseInserted[key] !== undefined) {
							delete baseInserted[key];
						} else {
							// There could be a modify entry for this key, which we have to remove
							if (baseModified && baseModified[key] !== undefined) {
								delete baseModified[key];
							}

							// Otherwise we add it to the remove list
							if (Array.isArray(baseRemoved)) {
								baseRemoved.push(key);
							} else {
								baseRemoved[key] = in_appliedPropertyChanges.remove[key];
							}
						}
					}
				} else {
					const baseInsertedTypeids = Object.keys(baseInserted);
					for (let i = 0; i < removedEntries.length; i++) {
						let key = removedEntries[i];
						let foundInTypeid;

						// Since we only have a flat remove list (without typeid) in the changeset, we have
						// to check all inserts
						for (let j = 0; j < baseInsertedTypeids.length; j++) {
							if (
								baseInserted[baseInsertedTypeids[j]] &&
								baseInserted[baseInsertedTypeids[j]][key] !== undefined
							) {
								foundInTypeid = baseInsertedTypeids[j];
								break;
							}
						}

						if (foundInTypeid) {
							// If this key was inserted by this ChangeSet, we just remove it from the inserted list
							delete baseInserted[foundInTypeid][key];

							// If all entries for a typeid have been removed, we can remove
							// the whole typeid from the inserted or modified section
							if (baseInserted && isEmpty(baseInserted[foundInTypeid])) {
								delete baseInserted[foundInTypeid];
							}
							if (baseModified && isEmpty(baseModified[foundInTypeid])) {
								delete baseModified[foundInTypeid];
							}
						} else {
							// There could be a modify entry for this key, which we have to remove
							const baseModifiedTypeids = Object.keys(baseModified || {});
							for (let j = 0; j < baseModifiedTypeids.length; j++) {
								if (baseModified[baseModifiedTypeids[j]][key]) {
									foundInTypeid = baseModifiedTypeids[j];
									delete baseModified[foundInTypeid][key];
									break;
								}
							}

							// Otherwise we add it to the remove list
							baseRemoved.push(key);
						}
					}
				}
			}
		}

		// Apply insert operations
		if (in_appliedPropertyChanges.insert) {
			// Get and initialize the corresponding entries from the existing collection
			io_basePropertyChanges = io_basePropertyChanges || {};
			io_basePropertyChanges.insert = io_basePropertyChanges.insert || {};
			let baseInserted = io_basePropertyChanges.insert;
			let baseRemoved = io_basePropertyChanges.remove;

			// Insert the inserted entries

			// If no typeids are included, we just use a placeholder for the iteration below
			const insertedTypeids = isPrimitiveTypeid
				? [undefined]
				: Object.keys(in_appliedPropertyChanges.insert);
			for (let i = 0; i < insertedTypeids.length; i++) {
				let typeid = insertedTypeids[i];
				const insertedEntries = isPrimitiveTypeid
					? in_appliedPropertyChanges.insert
					: in_appliedPropertyChanges.insert[typeid];
				const insertedKeys = Object.keys(insertedEntries);
				let removalCS;
				if (baseRemoved) {
					removalCS = isPrimitiveTypeid ? baseRemoved : baseRemoved[typeid];
				}
				for (let j = 0; j < insertedKeys.length; j++) {
					let key = insertedKeys[j];
					let deeplyEqualCS = false;

					// If we have a complex type in the collection, we need to do a deep comparison of the two
					// ChangeSets to determine, whether they are equal
					// TODO: We should actually compute a diff between the two and recursively convert portions to modifies
					// Instead, right now, we only handle the case where the two keys cancel each out perfectly, i.e.,
					// the insert is reinserting exactly what was removed.
					if (
						!isPrimitiveTypeid &&
						removalCS &&
						isObject(removalCS) &&
						removalCS[key] !== undefined
					) {
						// Split out the two parts: all the keys other than remove/insert should match exactly.
						// The contents 'remove' and 'insert', if they exist, should also match.
						deeplyEqualCS = !!insertedEntries[key].insert === !!removalCS[key].remove;

						// If there are 'insert' and 'remove', see if the removed data matches the inserted data
						if (deeplyEqualCS && insertedEntries[key].insert) {
							deeplyEqualCS = isEqual(insertedEntries[key].insert, removalCS[key].remove);
						}

						// Finally, check if the data being inserted matches the data that was removed
						const insertedEntry = isObject(insertedEntries[key])
							? omit(insertedEntries[key], "insert")
							: insertedEntries[key];
						const removedEntry = isObject(removalCS[key])
							? omit(removalCS[key], "remove")
							: removalCS[key];
						deeplyEqualCS = deeplyEqualCS && isEqual(insertedEntry, removedEntry);
					}

					if (
						(isPrimitiveTypeid || TypeIdHelper.isPrimitiveType(typeid) || deeplyEqualCS) &&
						removalCS &&
						((Array.isArray(removalCS) && includes(baseRemoved, key)) ||
							removalCS[key] !== undefined)
					) {
						// A remove and insert are combined into a modify for primitive types

						// Remove the old remove command
						let oldValueMatches = false;
						if (Array.isArray(removalCS)) {
							if (isPrimitiveTypeid) {
								io_basePropertyChanges.remove = without(io_basePropertyChanges.remove, key);
							} else {
								io_basePropertyChanges.remove[typeid] = without(
									io_basePropertyChanges.remove[typeid],
									key,
								);
							}
						} else {
							oldValueMatches = deeplyEqualCS || removalCS[key] === insertedEntries[key];
							delete removalCS[key];
						}

						// Insert a modify command instead
						if (!oldValueMatches) {
							io_basePropertyChanges.modify = io_basePropertyChanges.modify || {};
							if (isPrimitiveTypeid) {
								io_basePropertyChanges.modify[key] = insertedEntries[key];
							} else {
								io_basePropertyChanges.modify[typeid] =
									io_basePropertyChanges.modify[typeid] || {};
								io_basePropertyChanges.modify[typeid][key] = cloneDeep(insertedEntries[key]);
							}
						}
					} else if (isPrimitiveTypeid && baseInserted[key] === undefined) {
						baseInserted[key] = insertedEntries[key];
					} else if (
						!isPrimitiveTypeid &&
						(!baseInserted[typeid] || baseInserted[typeid][key] === undefined)
					) {
						baseInserted[typeid] = baseInserted[typeid] || {};
						baseInserted[typeid][key] = cloneDeep(insertedEntries[key]);
					} else {
						throw new Error(MSG.ALREADY_EXISTING_ENTRY + key);
					}
				}
			}
		}

		// Handle modification operations
		if (in_appliedPropertyChanges.modify) {
			// Get and initialize the corresponding entries from the existing collection
			const modifiedEntries = in_appliedPropertyChanges.modify;
			io_basePropertyChanges = io_basePropertyChanges || {};
			io_basePropertyChanges.modify = io_basePropertyChanges.modify || {};
			let baseModified = io_basePropertyChanges.modify;
			let baseInserted = io_basePropertyChanges.insert || {};

			// Process the modifications

			// If no typeids are included, we just use a placeholder for the iteration below
			const modifiedTypeids = isPrimitiveTypeid ? [undefined] : Object.keys(modifiedEntries);
			for (let i = 0; i < modifiedTypeids.length; i++) {
				let typeid = modifiedTypeids[i];

				const modifyKeys = Object.keys(
					isPrimitiveTypeid ? modifiedEntries : modifiedEntries[typeid],
				);
				for (let j = 0; j < modifyKeys.length; j++) {
					let key = modifyKeys[j];

					if (isPrimitiveTypeid) {
						let newValue = modifiedEntries[key];
						if (newValue && newValue.hasOwnProperty("value")) {
							newValue = newValue.value;
						}
						if (baseInserted[key] !== undefined) {
							// If this entry was added by this ChangeSet, we modify the insert operation according to the
							// new ChangeSet
							baseInserted[key] = newValue;
						} else {
							if (baseModified[key] && baseModified[key].hasOwnProperty("value")) {
								baseModified[key].value = newValue;
							} else {
								baseModified[key] = newValue;
							}
						}
					} else {
						// If this is a polymorphic collection, we can still have individual entries with
						// primitive types
						const isEntryPrimitiveType = TypeIdHelper.isPrimitiveType(typeid);

						if (baseInserted[typeid] && baseInserted[typeid][key] !== undefined) {
							// If this entry was added by this ChangeSet, we modify the insert operation according to the
							// new ChangeSet
							if (isEntryPrimitiveType && typeid !== "String") {
								let newValue = modifiedEntries[typeid][key];
								if (newValue && newValue.hasOwnProperty("value")) {
									newValue = modifiedEntries[typeid][key].value;
								}

								// In the case of Int64 or Uint64 we copy the array so that
								// both ChangeSets don't point to the same instance
								if (typeid === "Int64" || typeid === "Uint64") {
									newValue = newValue.slice();
								}

								if (
									baseInserted[typeid][key] &&
									baseInserted[typeid][key].hasOwnProperty("value")
								) {
									baseInserted[typeid][key].value = newValue;
								} else {
									baseInserted[typeid][key] = newValue;
								}
							} else {
								this.performApplyAfterOnPropertyWithTypeid(
									key,
									baseInserted[typeid],
									modifiedEntries[typeid],
									typeid,
									false,
									in_options,
								);
							}
						} else if (baseModified[typeid] && baseModified[typeid][key] !== undefined) {
							// If there was a previous modification operation, we have to merge the two
							if (isEntryPrimitiveType && typeid !== "String") {
								// Primitive types can simply be overwritten, however we have an exception for
								// 64 bit integers (until javascript natively supports them)
								if (typeid === "Int64" || typeid === "Uint64") {
									let appliedVal = modifiedEntries[typeid][key];
									if (appliedVal && appliedVal.hasOwnProperty("value")) {
										appliedVal = appliedVal.value;
									}
									baseModified[typeid][key] = appliedVal.slice();
								} else {
									baseModified[typeid][key] = modifiedEntries[typeid][key];
								}
							} else {
								this.performApplyAfterOnPropertyWithTypeid(
									key,
									baseModified[typeid],
									modifiedEntries[typeid],
									typeid,
									true,
									in_options,
								);
							}
						} else {
							baseModified[typeid] = baseModified[typeid] || {};
							baseModified[typeid][key] = cloneDeep(modifiedEntries[typeid][key]);
						}
					}
				}
			}
		}

		// Remove unnecessary entries from the ChangeSet
		this._cleanIndexedCollectionChangeSet(io_basePropertyChanges, !isPrimitiveTypeid);
	};

	/**
	 * Performs the rebase operation for set and map collections.
	 *
	 * @param in_ownPropertyChangeSet - The ChangeSet for this collection.
	 * @param io_rebasePropertyChangeSet - The ChangeSet for the collection to be rebased.
	 * @param in_basePath - Base path to get to the property processed by this function.
	 * @param in_typeid - The typeid of the contents collection (without the collection type).
	 * @param in_useSquareBracketsInPath - If set to true, paths will be created using the angular brackets syntax (for
	 * arrays), otherwise dots will be used (for NodeProperties).
	 * @param out_conflicts - A list of paths that resulted in conflicts together with the type of the conflict.
	 * @param in_options - Optional additional parameters.
	 * @param in_options.applyAfterMetaInformation - Additional meta information which help later to obtain
	 * more compact changeset during the apply operation.
	 *
	 * @private
	 */
	export const _rebaseIndexedCollectionChangeSetForProperty = function (
		in_ownPropertyChangeSet: SerializedChangeSet,
		io_rebasePropertyChangeSet: SerializedChangeSet,
		in_basePath: string,
		in_typeid: string,
		in_useSquareBracketsInPath: boolean,
		out_conflicts: ConflictInfo[],
		in_options: ApplyChangeSetOptions,
	) {
		const isPrimitiveTypeid = TypeIdHelper.isPrimitiveType(in_typeid);

		const changesByKeys = {};
		let modifyMap = {};
		// Helper function which stores the changes indexed by key in the changesByKeys array to
		// make it easier to compare the related changes in the two ChangeSets
		const addChanges = function (
			in_collection: Record<string, any>,
			in_changeIdentifier: string,
			in_changePrefix: string,
			in_typeidChange?: string,
		) {
			// Collection didn't exist in this ChangeSet
			if (in_collection === undefined) {
				return;
			}

			// For remove operations, the ChangeSet is only an array of keys, otherwise it is a map, so we have to
			// distinguish the two cases here
			const keys = Array.isArray(in_collection) ? in_collection : Object.keys(in_collection);

			// Add all entries indexed with the key
			for (let j = 0; j < keys.length; j++) {
				const key = keys[j];

				// Store the type of the change
				changesByKeys[key] = changesByKeys[key] || {};
				changesByKeys[key][in_changePrefix] = changesByKeys[key][in_changePrefix]
					? `${changesByKeys[key][in_changePrefix]}_${in_changeIdentifier}`
					: in_changeIdentifier;

				// If applicable store the typeid of the change
				if (in_typeidChange) {
					changesByKeys[key][`${in_changePrefix}Typeid`] = in_typeidChange;
				}

				// Store the ChangeSet
				if (in_changePrefix === "other") {
					changesByKeys[key].change = Array.isArray(in_collection) ? key : in_collection[key];
				}
			}
		};

		// Helper function which adds the Changes for a ChangeSet that is ordered by typeid
		const addChangesWithTypeids = function (
			in_collection,
			in_changeIdentifier,
			in_changePrefix,
		) {
			if (in_collection === undefined) {
				return;
			}
			// Iterate over the typeids (or use dummy entry for the iteration
			const addedKeyTypeids = Object.keys(in_collection);
			for (let i = 0; i < addedKeyTypeids.length; i++) {
				const Typeid = addedKeyTypeids[i];
				addChanges(in_collection[Typeid], in_changeIdentifier, in_changePrefix, Typeid);
			}
		};

		// Insert all changes from the ChangeSet into the lookup map
		if (Array.isArray(in_ownPropertyChangeSet.remove)) {
			addChanges(in_ownPropertyChangeSet.remove, "remove", "own");
		} else {
			if (isPrimitiveTypeid) {
				addChanges(in_ownPropertyChangeSet.remove, "remove", "own");
			} else {
				addChangesWithTypeids(in_ownPropertyChangeSet.remove, "remove", "own");
			}
		}

		if (Array.isArray(io_rebasePropertyChangeSet.remove)) {
			addChanges(io_rebasePropertyChangeSet.remove, "remove", "other");
		} else {
			if (isPrimitiveTypeid) {
				addChanges(io_rebasePropertyChangeSet.remove, "remove", "other");
			} else {
				addChangesWithTypeids(io_rebasePropertyChangeSet.remove, "remove", "other");
			}
		}

		if (isPrimitiveTypeid) {
			addChanges(in_ownPropertyChangeSet.insert, "insert", "own");
			addChanges(in_ownPropertyChangeSet.modify, "modify", "own");
			addChanges(io_rebasePropertyChangeSet.insert, "insert", "other");
			addChanges(io_rebasePropertyChangeSet.modify, "modify", "other");
		} else {
			addChangesWithTypeids(in_ownPropertyChangeSet.insert, "insert", "own");
			addChangesWithTypeids(in_ownPropertyChangeSet.modify, "modify", "own");
			addChangesWithTypeids(io_rebasePropertyChangeSet.insert, "insert", "other");
			addChangesWithTypeids(io_rebasePropertyChangeSet.modify, "modify", "other");
		}

		// Check for modifications that affect the same object
		const changedKeys = Object.keys(changesByKeys);
		for (let i = 0; i < changedKeys.length; i++) {
			const key = changedKeys[i];
			const newPath = in_useSquareBracketsInPath
				? `${in_basePath}[${PathHelper.quotePathSegmentIfNeeded(key)}]`
				: joinPaths(
						in_basePath,
						PathHelper.quotePathSegmentIfNeeded(key),
						PROPERTY_PATH_DELIMITER,
					);

			const modification = changesByKeys[key];
			if (modification.own && modification.other) {
				/*
                 We found a key that was changed by both ChangeSets at the same time
                 We now have to handle the conflicting changes. The changes we do, are summarized in this table:

                 <START REBASE HANDLING TABLE>
                 +-------+-----------------+------------------+-------------------+-------------------------------------+
                 |   \Own|    insert       |       modify     |     remove        |    remove+insert                    |
                 |    \  |                 |                  |                   |                                     |
                 |other\ |                 |                  |                   |                                     |
                 +=======+=================+==================+===================+=====================================+
                 |       | conflicting     | incompatible     | incompatible      | incompatible                        |
                 |insert | inserts         | psets            | psets             | psets                               |
                 |       |                 |                  |                   |                                     |
                 +-------+-----------------+------------------+-------------------+-------------------------------------+
                 |       | incompatible    | merge recursively| conflict          | conflict                            |
                 |modify | psets           | (conflicting  on |                   | (modify can not be applied due to   |
                 |       |                 | leaf)            | - delete modify   | to incompatible base)               |
                 |       |                 |                  |   in other        |                                     |
                 |       |                 |                  |                   | - delete modify in other            |
                 +-------+-----------------+------------------+-------------------+-------------------------------------+
                 |       | incompatible    | non-conflicting  | non-conflicting   | incompatible                        |
                 |remove | psets           | change           | change            | psets                               |
                 |       |                 |                  |                   |                                     |
                 |       |                 |                  | - rem dupl. remove|                                     |
                 +-------+-----------------+------------------+-------------------+-------------------------------------+
                 |       | incompatible    | non-conflicting  | non-conflicting   | conflict                            |
                 |remove+| psets           | change           | change            |                                     |
                 |insert |                 |                  |                   | - remove conflicting insert         |
                 |       |                 |                  | - rem dupl. remove|                                     |
                 +-------+-----------------+------------------+-------------------+-------------------------------------+
                 <END REBASE HANDLING TABLE>
                */

				// A key was modified after it had been removed
				if (modification.own === "modify" && modification.other === "modify") {
					if (
						isPrimitiveTypeid ||
						(TypeIdHelper.isPrimitiveType(modification.ownTypeid) &&
							modification.ownTypeid !== "String")
					) {
						// We have two modification operations that affect the same entry for a base type.
						// This is a legal operation, the second one will overwrite the first one, but we
						// report it as a possible conflict
						let ownModify = in_ownPropertyChangeSet.modify;
						let rebasedModify = io_rebasePropertyChangeSet.modify;
						if (modification.otherTypeid) {
							ownModify = ownModify[modification.otherTypeid];
							rebasedModify = rebasedModify[modification.otherTypeid];
						}

						let conflict = {
							path: newPath,
							type: ConflictType.COLLIDING_SET,
							conflictingChange: ownModify[key],
						};
						out_conflicts.push(conflict);
						// If value is the same, delete the entry
						let ownValue = ownModify[key];
						if (typeof ownValue === "object" && ownValue.hasOwnProperty("value")) {
							ownValue = ownValue.value;
						}
						let rebaseValue = rebasedModify[key];
						if (typeof rebaseValue === "object" && rebaseValue.hasOwnProperty("value")) {
							rebaseValue = rebaseValue.value;
						}
						if (
							modification.ownTypeid === "Int64" ||
							modification.ownTypeid === "Uint64" ||
							ownValue.length === 2
						) {
							// For (u)int64, values are arrays of 2 elements
							if (ownValue[0] === rebaseValue[0] && ownValue[1] === rebaseValue[1]) {
								delete rebasedModify[key];
							}
						} else {
							if (ownValue === rebaseValue) {
								delete rebasedModify[key];
							}
						}
					} else {
						this.rebaseChangeSetForPropertyEntryWithTypeid(
							key,
							in_ownPropertyChangeSet.modify[modification.ownTypeid],
							io_rebasePropertyChangeSet.modify[modification.otherTypeid],
							modification.ownTypeid,
							newPath,
							true,
							out_conflicts,
							in_options,
						);
					}
				} else if (modification.own === "remove" && modification.other === "modify") {
					modifyMap = modification.otherTypeid
						? io_rebasePropertyChangeSet.modify[modification.otherTypeid]
						: io_rebasePropertyChangeSet.modify;

					// Create the conflict information
					let conflict = {
						path: newPath,
						type: ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
						conflictingChange: modifyMap[key],
					};
					out_conflicts.push(conflict);

					// Delete the modification from the rebased ChangeSet
					delete modifyMap[key];
				} else if (modification.own === "remove_insert" && modification.other === "modify") {
					if (!isPrimitiveTypeid) {
						// We have a conflicting change. A node was removed and inserted (replaced) in the original
						// ChangeSet and then modified by the rebased ChangeSet. Since the base of the modification
						// can have been changed significantly by this operation, we don't know whether we can
						// apply the modification

						// Create the conflict information
						let conflict = {
							path: newPath,
							type: ConflictType.ENTRY_MODIFICATION_AFTER_REMOVE_INSERT,
							conflictingChange:
								io_rebasePropertyChangeSet.modify[modification.otherTypeid][key],
						};
						out_conflicts.push(conflict);

						// Delete the modification from the rebased ChangeSet
						delete io_rebasePropertyChangeSet.modify[modification.otherTypeid][key];
					}
				} else if (
					(modification.own === "modify" || modification.own === "remove") &&
					(modification.other === "remove" || modification.other === "remove_insert")
				) {
					if (modification.own === "modify") {
						modifyMap = modification.ownTypeid
							? in_ownPropertyChangeSet.modify[modification.ownTypeid]
							: in_ownPropertyChangeSet.modify;

						// Create the conflict information
						let conflict = {
							path: newPath,
							type: ConflictType.REMOVE_AFTER_MODIFY,
							conflictingChange: modifyMap[key],
						};
						out_conflicts.push(conflict);
					}

					// If we have a duplicated delete, we remove it from the new ChangeSet
					if (modification.own === "remove") {
						if (Array.isArray(io_rebasePropertyChangeSet.remove)) {
							io_rebasePropertyChangeSet.remove = without(
								io_rebasePropertyChangeSet.remove,
								key,
							);
						} else {
							if (isPrimitiveTypeid) {
								delete io_rebasePropertyChangeSet.remove[key];
							} else {
								delete io_rebasePropertyChangeSet.remove[modification.otherTypeid][key];
							}
						}
					}
				} else if (modification.own === "insert" && modification.other === "insert") {
					if (isPrimitiveTypeid || TypeIdHelper.isPrimitiveType(modification.ownTypeid)) {
						let insertMap = modification.otherTypeid
							? io_rebasePropertyChangeSet.insert[modification.otherTypeid]
							: io_rebasePropertyChangeSet.insert;

						// We have two insert operations that affect the same key for a primitive type.
						// This is a legal operation, the second one will overwrite the first one, but we
						// report it as a possible conflicting set
						let conflict = {
							path: newPath,
							type: ConflictType.COLLIDING_SET,
							conflictingChange: insertMap[key],
						};
						out_conflicts.push(conflict);

						// Convert to modify
						let oldValue;
						if (modification.otherTypeid) {
							io_rebasePropertyChangeSet.modify = io_rebasePropertyChangeSet.modify || {};
							io_rebasePropertyChangeSet.modify[modification.otherTypeid] =
								io_rebasePropertyChangeSet.modify[modification.otherTypeid] || {};
							modifyMap = io_rebasePropertyChangeSet.modify[modification.otherTypeid];
							oldValue = in_ownPropertyChangeSet.insert[modification.ownTypeid][key];
						} else {
							io_rebasePropertyChangeSet.modify = io_rebasePropertyChangeSet.modify || {};
							modifyMap = io_rebasePropertyChangeSet.modify;
							oldValue = in_ownPropertyChangeSet.insert[key];
						}

						modifyMap[key] = { value: insertMap[key], oldValue };
						delete insertMap[key];
					} else {
						// Here we have two insert operations for objects. Since these affect a whole sub-tree and not
						// just a single value, we cannot easily convert it into a modify and instead report it as invalid

						let insertMap = modification.otherTypeid
							? io_rebasePropertyChangeSet.insert[modification.otherTypeid]
							: io_rebasePropertyChangeSet.insert;

						// Create the conflict information
						let conflict = {
							path: newPath,
							type: ConflictType.INSERTED_ENTRY_WITH_SAME_KEY,
							conflictingChange: insertMap[key],
						};
						out_conflicts.push(conflict);

						// Delete the modification from the rebased ChangeSet
						delete insertMap[key];
					}
				} else if (
					modification.own === "remove_insert" &&
					modification.other === "remove_insert"
				) {
					let insertMap = modification.otherTypeid
						? io_rebasePropertyChangeSet.insert[modification.otherTypeid]
						: io_rebasePropertyChangeSet.insert;

					// Raise the duplicate inserts as a conflict
					let conflict = {
						path: newPath,
						type: ConflictType.COLLIDING_SET,
						conflictingChange: insertMap[key],
					};
					out_conflicts.push(conflict);
				} else {
					// All other operations are conflicting changes, which only occur for ChangeSets that are relative
					// to different bases

					// Create the conflict information
					let conflict = {
						path: newPath,
						type: ConflictType.INVALID_CHANGESET_BASE,
						conflictingChange: modification.change,
					};
					out_conflicts.push(conflict);

					// Remove the change from the ChangeSet
					if (modification.other !== "remove") {
						if (modification.otherTypeid !== undefined) {
							delete io_rebasePropertyChangeSet[modification.other][modification.otherTypeid][
								key
							];
						} else {
							delete io_rebasePropertyChangeSet[modification.other][key];
						}
					} else {
						// Remove remove operations from the ChangeSet
						if (Array.isArray(io_rebasePropertyChangeSet[modification.other])) {
							io_rebasePropertyChangeSet[modification.other] = without(
								io_rebasePropertyChangeSet[modification.other],
								key,
							);
						} else {
							delete io_rebasePropertyChangeSet[modification.other][key];
						}
					}

					console.error(
						"Rebase operation with conflicting ChangeSets. Probably incorrect bases.",
					);
				}
			}
		}

		// Remove unnecessary entries from the ChangeSet
		this._cleanIndexedCollectionChangeSet(io_rebasePropertyChangeSet, !isPrimitiveTypeid);
	};

	/**
	 * Removes empty entries from the .children collection of the ChangeSet
	 *
	 * @param in_propertyChanges - The ChangeSet to clean up
	 * @param in_containsTypeids - Does this ChangeSet contain typeids
	 * @private
	 */
	export const _cleanIndexedCollectionChangeSet = function (
		in_propertyChanges: SerializedChangeSet,
		in_containsTypeids: boolean,
	) {
		const changes = in_propertyChanges;
		// Clean inserts

		// First remove unused typeid sections
		if (in_containsTypeids) {
			let typeidList = Object.keys(changes.insert || {});
			for (let j = 0; j < typeidList.length; j++) {
				if (_fastIsEmptyObject(changes.insert[typeidList[j]])) {
					delete changes.insert[typeidList[j]];
				}
			}
		}

		// Remove add group if no operations are present
		if (_fastIsEmptyObject(changes.insert)) {
			delete changes.insert;
		}

		// First remove unused typeid sections
		if (in_containsTypeids) {
			let typeidList = Object.keys(changes.remove || {});
			for (let j = 0; j < typeidList.length; j++) {
				if (_fastIsEmptyObject(changes.remove[typeidList[j]])) {
					delete changes.remove[typeidList[j]];
				}
			}
		}
		// Remove remove group if no operations are present
		if (_fastIsEmptyObject(changes.remove)) {
			delete changes.remove;
		}

		// Clean modifies

		// First remove unused typeid sections
		if (in_containsTypeids) {
			let typeidList = Object.keys(changes.modify || {});
			for (let j = 0; j < typeidList.length; j++) {
				const modifies = changes.modify[typeidList[j]];
				const modifyKeys = Object.keys(modifies);
				for (let k = 0; k < modifyKeys.length; k++) {
					if (isEmptyChangeSet(modifies[modifyKeys[k]])) {
						delete modifies[modifyKeys[k]];
					}
				}
				if (_fastIsEmptyObject(changes.modify[typeidList[j]])) {
					delete changes.modify[typeidList[j]];
				}
			}
		}

		// Remove modify group if no operations are present
		if (_fastIsEmptyObject(changes.modify)) {
			delete changes.modify;
		}
	};
}
