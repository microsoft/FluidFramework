/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Abstract base class for indexed collections (sets and maps)
 */

const { ChangeSet } = require("@fluid-experimental/property-changeset");
const { ConsoleUtils } = require("@fluid-experimental/property-common");
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");

const { deserialize } = require("../containerSerializer");
const { validationsEnabled } = require("../enableValidations");

const { AbstractStaticCollectionProperty } = require("./abstractStaticCollectionProperty");
const { BaseProperty } = require("./baseProperty");

/**
 * typedef {property-properties.BaseProperty|string|number|boolean} property-properties.IndexedCollectionBaseProperty~ValueType
 *
 * The type of the values that are set/inserted into the collection. Depending on the type of the collection, these
 * can either be property objects or primitive values
 */

/**
 * A IndexedCollectionBaseProperty is the base class for indexed collections (maps and sets). It should not be used
 * directly.
 */
export class IndexedCollectionBaseProperty extends AbstractStaticCollectionProperty {
	/**
	 * @param {Object} in_params - Input parameters for property creation
	 *
	 * @constructor
	 */
	constructor(in_params) {
		super(in_params);
		/** Stores the pending changes in the property (those that are part of the current ChangeSet) */
		this._pendingChanges = {
			insert: {},
			remove: {},
			modify: {},
		};

		/** Stores the dirty changes in the property (those that have not yet been reported to the application) */
		this._dirtyChanges = {
			insert: {},
			remove: {},
			modify: {},
		};
	}

	/**
	 * Removes the dirtiness flag from this property
	 *
	 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean
	 * If none are supplied, all will be removed.
	 * @private
	 */
	_cleanDirty(in_flags) {
		// Invoke parent
		BaseProperty.prototype._cleanDirty.call(this, in_flags);

		if (
			in_flags === undefined ||
			(in_flags & BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE) !== 0
		) {
			// We additionally have to remove the log on the changes to our entries
			this._pendingChanges.insert = {};
			this._pendingChanges.remove = {};
			this._pendingChanges.modify = {};
		}

		if (in_flags === undefined || (in_flags & BaseProperty.MODIFIED_STATE_FLAGS.DIRTY) !== 0) {
			// We additionally have to remove the log on the changes to our entries
			this._dirtyChanges.insert = {};
			this._dirtyChanges.remove = {};
			this._dirtyChanges.modify = {};
		}
	}

	/**
	 * Removes the dirtiness flag from this property and recursively from all of its children
	 *
	 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean.
	 * If none are supplied, all will be removed.
	 */
	cleanDirty(in_flags) {
		in_flags =
			in_flags !== undefined
				? in_flags
				: BaseProperty.MODIFIED_STATE_FLAGS.DIRTY |
					BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE;

		// Clean all entries inside of the collection
		let cleanDirtiness = (collection) => {
			var entry;

			// eslint-disable-next-line no-restricted-syntax
			for (let key in collection) {
				entry = this._dynamicChildren[key];
				if (entry._isDirty(in_flags)) {
					entry.cleanDirty(in_flags);
				}
			}
		};

		if (!this._containsPrimitiveTypes) {
			if (in_flags === BaseProperty.MODIFIED_STATE_FLAGS.DIRTY) {
				// Only use the dirty entries
				cleanDirtiness(this._dirtyChanges.insert);
				cleanDirtiness(this._dirtyChanges.modify);
			} else if (in_flags === BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE) {
				// Only use the pending changes
				cleanDirtiness(this._pendingChanges.insert);
				cleanDirtiness(this._pendingChanges.modify);
			} else {
				cleanDirtiness(this._pendingChanges.insert);
				cleanDirtiness(this._pendingChanges.modify);
				cleanDirtiness(this._dirtyChanges.insert);
				cleanDirtiness(this._dirtyChanges.modify);
			}
		}

		// Invoke parent
		BaseProperty.prototype.cleanDirty.call(this, in_flags);

		// after all entries have been cleaned, we mark this property as clean
		this._cleanDirty(in_flags);
	}

	/**
	 * Inserts a property into the collection
	 *
	 * @param {string} in_key - Key of the entry in the collection
	 * @param {property-properties.IndexedCollectionBaseProperty~ValueType} in_value - The value to insert
	 * @param {boolean} in_reportToView -
	 * By default, the dirtying will always be reported to the checkout view and trigger a modified event there.
	 * When batching updates, this can be prevented via this flag.
	 */
	_insert(in_key, in_value, in_reportToView) {
		if (validationsEnabled.enabled) {
			this._checkIsNotReadOnly(false);
		}

		if (!this.has(in_key)) {
			// Make sure, the property we are inserting is not already part of some other collection
			if (validationsEnabled.enabled && !this._containsPrimitiveTypes) {
				in_value._validateInsertIn(this);
			}

			this._dynamicChildren[in_key] = in_value;

			// We have to make sure, both this node itself and the whole tree of the inserted
			// entry are marked as dirty to make sure, they get serialized
			// We don't yet report the dirtying to the view. This happens below.
			this._setDirty(false);

			if (!this._containsPrimitiveTypes) {
				// Dirty the tree (TODO: is this needed?)
				in_value._setDirtyTree(false);

				in_value._setParent(this);

				// In the case of a template property, we always mark it as inserted
				this._pendingChanges.insert[in_key] = true;
				this._dirtyChanges.insert[in_key] = true;
			} else {
				// For primitive types we squash remove/insert combinations to modifies
				if (this._pendingChanges.remove[in_key] && !this._pendingChanges.insert[in_key]) {
					this._pendingChanges.modify[in_key] = true;
					delete this._pendingChanges.remove[in_key];
				} else {
					this._pendingChanges.insert[in_key] = true;
				}

				if (this._dirtyChanges.remove[in_key] && !this._dirtyChanges.insert[in_key]) {
					this._dirtyChanges.modify[in_key] = true;
					delete this._dirtyChanges.remove[in_key];
				} else {
					this._dirtyChanges.insert[in_key] = true;
				}
			}

			// Now make one report
			if (in_reportToView) {
				this._reportDirtinessToView();
			}
		} else {
			throw new Error(MSG.PROPERTY_ALREADY_EXISTS + in_key);
		}
	}

	/**
	 * Removes an entry with the given key
	 *
	 * @param {string} in_key - key of the entry
	 * @param {boolean} in_reportToView - By default, the dirtying will always be reported to the checkout view and
	 * trigger a modified event there.
	 * When batching updates, this can be prevented via this flag.
	 */
	_removeByKey(in_key, in_reportToView) {
		this._checkIsNotReadOnly(false);

		if (this._dynamicChildren[in_key] !== undefined) {
			if (this._dynamicChildren[in_key] instanceof BaseProperty) {
				this._dynamicChildren[in_key]._setParent(undefined);
			}

			delete this._dynamicChildren[in_key];

			// make sure this is not present in the insert list!
			if (this._pendingChanges.insert[in_key]) {
				delete this._pendingChanges.insert[in_key];
			} else {
				this._pendingChanges.remove[in_key] = true;

				// Also remove modifies, if any are present
				delete this._pendingChanges.modify[in_key];
			}

			// also update the list of dirty changes
			if (this._dirtyChanges.insert[in_key]) {
				delete this._dirtyChanges.insert[in_key];
			} else {
				this._dirtyChanges.remove[in_key] = true;

				// Also remove modifies, if any are present
				delete this._dirtyChanges.modify[in_key];
			}

			this._setDirty(in_reportToView);
		} else {
			throw new Error(MSG.REMOVED_NON_EXISTING_ENTRY + in_key);
		}
	}

	/**
	 * Serialize the property
	 *
	 * @param {boolean} in_dirtyOnly - Only include dirty entries in the serialization
	 * @param {boolean} in_includeRootTypeid - Include the typeid of the root of the hierarchy
	 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] - The type of dirtiness to use
	 * when reporting dirty changes. By default this is `PENDING_CHANGE`.
	 * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
	 * function will descend into referenced repositories.
	 * WARNING: if there are loops in the references this can result in an infinite loop.
	 *
	 * @return {Object} The serialized representation of this property
	 * @private
	 */
	_serialize(
		in_dirtyOnly,
		in_includeRootTypeid,
		in_dirtinessType,
		in_includeReferencedRepositories,
	) {
		var serialized = AbstractStaticCollectionProperty.prototype._serialize.call(
			this,
			in_dirtyOnly,
			in_includeRootTypeid,
			in_dirtinessType,
			in_includeReferencedRepositories,
		);

		var that = this;

		// Helper function to decide whether to include a typeid or not in the ChangeSet
		var addEntryInChangeSet = function (in_changes, in_typeid, in_key, in_value) {
			// Determine where to insert the key. If necessary, an entry for the type is added.
			if (that._containsPrimitiveTypes) {
				in_changes[in_key] = that._serializeValue(in_value);
			} else {
				in_changes[in_typeid] = in_changes[in_typeid] || {};
				in_changes[in_typeid][in_key] = in_value;
			}
		};

		var changes =
			in_dirtinessType === BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE
				? this._pendingChanges
				: this._dirtyChanges;
		var insert = {};
		var modify = {};
		// we only remove entries when computing the delta
		var remove = in_dirtyOnly ? _.keys(changes.remove) : [];

		// Iterate over all children (and not properties)
		var typeid;
		var entryKeys = in_dirtyOnly
			? _.keys(changes.modify).concat(_.keys(changes.insert)) // Only dirty keys
			: _.keys(this._dynamicChildren); // All keys
		for (var i = 0; i < entryKeys.length; i++) {
			var key = entryKeys[i];
			var entry = this._dynamicChildren[key];
			typeid = this._containsPrimitiveTypes
				? this.getFullTypeid(false)
				: entry.getFullTypeid(false);
			if (in_dirtyOnly) {
				if (changes.insert[key]) {
					// If the key was inserted in this ChangeSet include it into the inserted list
					if (this._containsPrimitiveTypes) {
						addEntryInChangeSet(insert, typeid, key, entry);
					} else {
						addEntryInChangeSet(
							insert,
							typeid,
							key,
							entry._serialize(false, false, undefined, in_includeReferencedRepositories),
						);
					}
				} else {
					// Check whether this is a modified entry and serialize changes when needed
					if (this._containsPrimitiveTypes) {
						if (changes.modify[key]) {
							addEntryInChangeSet(modify, typeid, key, entry);
						}
					} else {
						if (entry._isDirty(in_dirtinessType)) {
							var serializedChild = entry._serialize(
								in_dirtyOnly,
								false,
								in_dirtinessType,
								in_includeReferencedRepositories,
							);
							if (!ChangeSet.isEmptyChangeSet(serializedChild)) {
								addEntryInChangeSet(modify, typeid, key, serializedChild);
							}
						}
					}
				}
			} else {
				// If we serialize everything, all entries are inserted
				if (this._containsPrimitiveTypes) {
					insert[key] = this._serializeValue(entry);
				} else {
					insert[typeid] = insert[typeid] || {};
					insert[typeid][key] = entry._serialize(
						in_dirtyOnly,
						false,
						undefined,
						in_includeReferencedRepositories,
					);
				}
			}
		}

		// Serialize the changes
		if (!_.isEmpty(insert)) {
			serialized.insert = insert;
		}

		if (!_.isEmpty(remove)) {
			serialized.remove = remove;
		}

		if (!_.isEmpty(modify)) {
			serialized.modify = modify;
		}

		return serialized;
	}

	/**
	 * Function to deserialize special primitive types.
	 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
	 * special treatment on deserialization. For supported types, we can just return the input here.
	 *
	 * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
	 * @return {*} the deserialized value
	 */
	_deserializeValue(in_serializedObj) {
		return in_serializedObj;
	}

	/**
	 * Function to serialize special primitive types.
	 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
	 * special treatment on serialization. For supported types, we can just return the input here.
	 *
	 * @param {*} in_obj - The object to be serialized
	 * @return {property-properties.SerializedChangeSet} the serialized object
	 */
	_serializeValue(in_obj) {
		ConsoleUtils.assert(
			this._containsPrimitiveTypes,
			MSG.ASSERTION_FAILED +
				"Function IndexedCollectionBaseProperty._serializeValue() called on non-primitive collection",
		);
		return in_obj;
	}

	/**
	 * @inheritdoc
	 *
	 * @param {Object} [in_filteringOptions = {}] - The filtering options to consider while deserializing the property.
	 * @param {boolean} [in_createChangeSet = true] - Should a changeset be created for this deserialization?
	 */
	_deserialize(in_serializedObj, in_reportToView, in_filteringOptions, in_createChangeSet) {
		var currentEntries = this._dynamicChildren;
		var allInsertedKeys = {};

		var appliedChangeset = AbstractStaticCollectionProperty.prototype._deserialize.call(
			this,
			in_serializedObj,
			false,
			in_filteringOptions,
			in_createChangeSet,
		);

		// Perform updates to the children

		// We make copies on two levels, since those are modified by the calls below
		var insertedEntries =
			_.mapValues(in_serializedObj.insert, function (x) {
				return _.clone(x);
			}) || {};
		var removedEntries = {};
		var modifiedEntries = {};

		// Get a list of all keys that will be inserted
		if (this._containsPrimitiveTypes) {
			var dataKeys = _.keys(insertedEntries);
			for (var iData = 0; iData < dataKeys.length; iData++) {
				var key = dataKeys[iData];
				allInsertedKeys[key] = true;
			}
		} else {
			var classKeys = _.keys(insertedEntries);
			for (var iClass = 0; iClass < classKeys.length; iClass++) {
				var typeid = classKeys[iClass];
				var dataKeys = _.keys(insertedEntries[typeid]);
				for (var iData = 0; iData < dataKeys.length; iData++) {
					var key = dataKeys[iData];
					allInsertedKeys[key] = true;
				}
			}
		}

		// Intersect the list of current keys, with the list of keys that will
		// NOT be inserted. Then insert the difference in the remove list so that
		// no objects are left dangling
		var keys = _.keys(currentEntries);
		for (var i = 0; i < keys.length; i++) {
			if (!allInsertedKeys[keys[i]]) {
				removedEntries[keys[i]] = true;
			}
		}

		// Remap adds to modify if the items are already in the document.
		// We want to make sure we reuse the current document state as much as possible
		// and simply change the bits that need to be changed. In many cases the
		// document will already contain the items but they need to be modified to
		// match the state described in_changeSet.
		if (this._containsPrimitiveTypes) {
			var addedKeys = Object.keys(insertedEntries);
			for (i = 0; i < addedKeys.length; i++) {
				if (currentEntries[addedKeys[i]] !== undefined) {
					modifiedEntries[addedKeys[i]] = insertedEntries[addedKeys[i]];
					delete insertedEntries[addedKeys[i]];
				}
			}
		} else {
			classKeys = _.keys(insertedEntries);
			for (iClass = 0; iClass < classKeys.length; iClass++) {
				typeid = classKeys[iClass];
				var addedKeys = Object.keys(insertedEntries[typeid]);
				for (i = 0; i < addedKeys.length; i++) {
					if (currentEntries[addedKeys[i]] !== undefined) {
						modifiedEntries[typeid] = modifiedEntries[typeid] || {};
						modifiedEntries[typeid][addedKeys[i]] = insertedEntries[typeid][addedKeys[i]];
						delete insertedEntries[typeid][addedKeys[i]];
					}
				}

				// Remove add entries, when they are empty
				if (_.isEmpty(insertedEntries[typeid])) {
					delete insertedEntries[typeid];
				}
			}
		}

		// Begin by removing what needs to be removed.
		keys = Object.keys(removedEntries);
		for (i = 0; i < keys.length; i++) {
			this._removeByKey(keys[i], false);
		}

		// Now get the portion of the children that must be added
		// this is a straightforward deserialize.
		if (this._containsPrimitiveTypes) {
			keys = _.keys(insertedEntries);
			for (i = 0; i < keys.length; i++) {
				this._insert(keys[i], this._deserializeValue(insertedEntries[keys[i]]), false);
			}
		} else {
			var scope = this._getScope();
			var newPsets = deserialize(insertedEntries, scope);
			keys = _.keys(newPsets);
			for (i = 0; i < keys.length; i++) {
				this._insert(keys[i], newPsets[keys[i]], false);
			}
		}

		// If no typeids are included, we just use a placeholder for the iteration below
		var classKeys = this._containsPrimitiveTypes ? [undefined] : _.keys(modifiedEntries);

		// Finally modify the existing properties
		var mapWasChangedByModify = false;
		for (iClass = 0; iClass < classKeys.length; iClass++) {
			typeid = classKeys[iClass];
			var modifiedKeys = Object.keys(
				this._containsPrimitiveTypes ? modifiedEntries : modifiedEntries[typeid],
			);
			for (i = 0; i < modifiedKeys.length; i++) {
				var changes;
				var valueWasChanged = false;
				var modifiedEntriesMap;
				if (this._containsPrimitiveTypes) {
					changes = modifiedEntries[modifiedKeys[i]];
					// Determine if value has changed
					valueWasChanged =
						this._typeid === "Int64" || this._typeid === "Uint64"
							? // For (u)int64, we will compare (Ui/I)nt64 objects with arrays [low, high]
								this._dynamicChildren[modifiedKeys[i]].getValueLow() !== changes[0] ||
								this._dynamicChildren[modifiedKeys[i]].getValueHigh() !== changes[1]
							: this._dynamicChildren[modifiedKeys[i]] !== changes;
					modifiedEntriesMap = modifiedEntries;
					if (valueWasChanged) {
						this._dynamicChildren[modifiedKeys[i]] = this._deserializeValue(changes);
						// After modifying an entry, we have to update the flags
						// If there is a pending insert, we don't need to mark this as
						// a modify, as it will just change the insert. Otherwise, this
						// has to be reported as modify
						if (!this._pendingChanges.insert[modifiedKeys[i]]) {
							this._pendingChanges.modify[modifiedKeys[i]] = true;
							mapWasChangedByModify = true;
						}
						if (!this._dirtyChanges.insert[modifiedKeys[i]]) {
							this._dirtyChanges.modify[modifiedKeys[i]] = true;
							mapWasChangedByModify = true;
						}
					}
				} else {
					changes = this._dynamicChildren[modifiedKeys[i]]._deserialize(
						modifiedEntries[typeid][modifiedKeys[i]],
						false,
						in_filteringOptions,
						in_createChangeSet,
					);
					valueWasChanged = !ChangeSet.isEmptyChangeSet(changes);

					modifiedEntries[typeid] = modifiedEntries[typeid] || {};
					modifiedEntriesMap = modifiedEntries[typeid];
				}

				if (valueWasChanged) {
					modifiedEntriesMap[modifiedKeys[i]] = changes;
				} else {
					delete modifiedEntriesMap[modifiedKeys[i]];
				}
			}

			if (!this._containsPrimitiveTypes && _.isEmpty(modifiedEntries[typeid])) {
				delete modifiedEntries[typeid];
			}
		}

		// Create a ChangeSet with the actually applied changes
		if (!_.isEmpty(insertedEntries)) {
			appliedChangeset.insert = _.clone(insertedEntries);
		}

		if (!_.isEmpty(removedEntries)) {
			appliedChangeset.remove = _.keys(removedEntries);
		}

		if (!_.isEmpty(modifiedEntries)) {
			appliedChangeset.modify = modifiedEntries;
		}

		// If working with primitive types, we have to update the dirty flag, when one of the entries
		// was changed
		if (mapWasChangedByModify) {
			this._setDirty(false);
		}

		// Finally report the dirtiness to the view (we postponed this above)
		if (in_reportToView) {
			this._reportDirtinessToView();
		}

		return appliedChangeset;
	}

	/**
	 * @inheritdoc
	 */
	_applyChangeset(in_changeSet, in_reportToView) {
		BaseProperty.prototype._applyChangeset.call(this, in_changeSet, false);

		// Remove existing entries
		// (we remove before we add, so that a remove+add operation in effect becomes a replace)
		if (in_changeSet.remove) {
			if (_.isArray(in_changeSet.remove)) {
				for (var i = 0; i < in_changeSet.remove.length; i++) {
					var key = in_changeSet.remove[i];
					this._removeByKey(key, false);
				}
			} else {
				// handle remove is an object case:
				if (!this._containsPrimitiveTypes) {
					var types = Object.keys(in_changeSet.remove);
					for (var i = 0; i < types.length; i++) {
						var keys = Object.keys(in_changeSet.remove[types[i]]);
						for (var j = 0; j < keys.length; j++) {
							this._removeByKey(keys[j], false);
						}
					}
				} else {
					var keys = Object.keys(in_changeSet.remove);
					for (var j = 0; j < keys.length; j++) {
						this._removeByKey(keys[j], false);
					}
				}
			}
		}

		// Insert entries (we just have to deserialize and insert them)
		if (in_changeSet.insert) {
			var newPsets;
			if (this._containsPrimitiveTypes) {
				newPsets = in_changeSet.insert;
			} else {
				var scope = this._getScope();
				newPsets = deserialize(in_changeSet.insert, scope);
			}
			var keys = Object.keys(newPsets);
			for (var i = 0; i < keys.length; i++) {
				if (!this._dynamicChildren[keys[i]]) {
					this._insert(keys[i], newPsets[keys[i]], false);
				} else {
					throw new Error(MSG.INSERTED_EXISTING_ENTRY + keys[i]);
				}
			}
		}

		// Modify entries
		var mapWasChangedByModify = false;
		if (in_changeSet.modify) {
			var classKeys = this._containsPrimitiveTypes ? [undefined] : _.keys(in_changeSet.modify);
			for (var iClass = 0; iClass < classKeys.length; iClass++) {
				var modifiedEntries = this._containsPrimitiveTypes
					? in_changeSet.modify
					: in_changeSet.modify[classKeys[iClass]];
				var keys = Object.keys(modifiedEntries);
				for (var i = 0; i < keys.length; i++) {
					var key = keys[i];
					if (this._dynamicChildren[key] !== undefined) {
						if (this._containsPrimitiveTypes) {
							var modifiedEntry = modifiedEntries[key];
							if (typeof modifiedEntry === "object") {
								modifiedEntry = modifiedEntry.value;
							}
							this._dynamicChildren[key] = modifiedEntry;

							// After modifying an entry, we have to update the flags
							// If there is a pending insert, we don't need to mark this as
							// a modify, as it will just change the insert. Otherwise, this
							// has to be reported as modify
							if (!this._pendingChanges.insert[key]) {
								this._pendingChanges.modify[key] = true;
								mapWasChangedByModify = true;
							}
							if (!this._dirtyChanges.insert[key]) {
								this._dirtyChanges.modify[key] = true;
								mapWasChangedByModify = true;
							}
						} else {
							this._dynamicChildren[key]._applyChangeset(modifiedEntries[key], false);
						}
					} else {
						throw new Error(MSG.MODIFY_NON_EXISTING_ENTRY + key);
					}
				}
			}
		}

		// If working with primitive types, we have to update the dirty flag, when one of the entries
		// was changed
		if (mapWasChangedByModify) {
			this._setDirty(false);
		}

		// Finally report the dirtiness to the view (we postponed this above)
		if (in_reportToView) {
			this._reportDirtinessToView();
		}
	}

	/**
	 * @inheritdoc
	 */
	_reapplyDirtyFlags(in_pendingChangeSet, in_dirtyChangeSet) {
		BaseProperty.prototype._reapplyDirtyFlags.call(
			this,
			in_pendingChangeSet,
			in_dirtyChangeSet,
		);

		var i, j, types, keys, key;

		// Remove existing entries
		// (we remove before we add, so that a remove+add operation in effect becomes a replace)
		if (in_pendingChangeSet.remove) {
			if (_.isArray(in_pendingChangeSet.remove)) {
				for (i = 0; i < in_pendingChangeSet.remove.length; i++) {
					key = in_pendingChangeSet.remove[i];
					this._pendingChanges.remove[key] = true;
				}
			} else {
				// handle remove is an object case:
				types = Object.keys(in_pendingChangeSet.remove);
				for (i = 0; i < types.length; i++) {
					keys = Object.keys(in_pendingChangeSet.remove[types[i]]);
					for (j = 0; j < keys.length; j++) {
						this._pendingChanges.remove[keys[j]] = true;
					}
				}
			}
		}

		// Inserted entries
		if (in_pendingChangeSet.insert) {
			types = Object.keys(in_pendingChangeSet.insert);
			for (i = 0; i < types.length; i++) {
				keys = Object.keys(in_pendingChangeSet.insert[types[i]]);
				for (j = 0; j < keys.length; j++) {
					key = keys[j];
					if (this._dynamicChildren[key] !== undefined) {
						this._pendingChanges.insert[key] = true;
					} else {
						throw new Error(`${MSG.CANT_DIRTY_MISSING_PROPERTY}${key}`);
					}
				}
			}
		}

		// Modify entries
		if (in_pendingChangeSet.modify) {
			var classKeys = _.keys(in_pendingChangeSet.modify);
			for (var iClass = 0; iClass < classKeys.length; iClass++) {
				var modifiedPendingEntries =
					(in_pendingChangeSet.modify && in_pendingChangeSet.modify[classKeys[iClass]]) || {};
				var modifiedDirtyEntries =
					(in_dirtyChangeSet.modify && in_dirtyChangeSet.modify[classKeys[iClass]]) || {};
				keys = Object.keys(modifiedPendingEntries).concat(Object.keys(modifiedDirtyEntries));
				for (i = 0; i < keys.length; i++) {
					key = keys[i];
					if (this._dynamicChildren[key] !== undefined) {
						this._dynamicChildren[key]._reapplyDirtyFlags(
							modifiedPendingEntries[key],
							modifiedDirtyEntries[key],
						);
					} else {
						throw new Error(MSG.MODIFY_NON_EXISTING_ENTRY + key);
					}
				}
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	_setDirty(in_reportToView, in_callingChild) {
		// Mark the child as modified
		if (in_callingChild && !this._containsPrimitiveTypes) {
			var key = in_callingChild.getId();
			if (this._dynamicChildren[key]) {
				if (!this._pendingChanges.insert[key]) {
					this._pendingChanges.modify[key] = true;
				}
				if (!this._dirtyChanges.insert[key]) {
					this._dirtyChanges.modify[key] = true;
				}
			}
		}

		// Forward dirtiness propagation to base class
		BaseProperty.prototype._setDirty.call(this, in_reportToView, in_callingChild);
	}
}
/** Specifies, whether this is a collection of base types or of registered templates */
IndexedCollectionBaseProperty.prototype._containsPrimitiveTypes = false;
