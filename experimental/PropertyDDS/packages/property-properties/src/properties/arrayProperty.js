/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the array property class
 */
const {
    ArrayChangeSetIterator,
    ChangeSet,
    PathHelper,
    TypeIdHelper,
} = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { UniversalDataArray, ConsoleUtils } = require('@fluid-experimental/property-common');
const fastestJSONCopy = require('fastest-json-copy');
const _ = require('lodash');
const { deserializeNonPrimitiveArrayElements } = require('../containerSerializer');
const { validationsEnabled } = require('../enableValidations');
const { AbstractStaticCollectionProperty } = require('./abstractStaticCollectionProperty');
const { BaseProperty } = require('./baseProperty');
const { LazyLoadedProperties: Property } = require('./lazyLoadedProperties');

const deepCopy = fastestJSONCopy.copy;

var MODIFIED_STATE_FLAGS = BaseProperty.MODIFIED_STATE_FLAGS;

// Some global constant objects that are used to indicate a few special
// cases for the dirty object. If there are no entries in the pending and
// dirty changesets, but the array still has a pending or dirty state
// flag we use these objects to indicate this state. This happens for custom
// type array, for which the children have been changed.
// By using these special objects we avoid the memory overhead of having a separate
// object for each array in this state.
var DIRTY_AND_PENDING_CHILD_CHANGES = {
    pending: undefined,
    dirty: undefined,
    flags: MODIFIED_STATE_FLAGS.PENDING_CHANGE | MODIFIED_STATE_FLAGS.DIRTY,
};
var PENDING_CHILD_CHANGES = {
    pending: undefined,
    dirty: undefined,
    flags: MODIFIED_STATE_FLAGS.PENDING_CHANGE,
};
var DIRTY_CHILD_CHANGES = {
    pending: undefined,
    dirty: undefined,
    flags: MODIFIED_STATE_FLAGS.DIRTY,
};
var DIRTY_STATE_FLAGS_ARRAY = [
    undefined,
    PENDING_CHILD_CHANGES,
    DIRTY_CHILD_CHANGES,
    DIRTY_AND_PENDING_CHILD_CHANGES,
];

var PATH_TOKENS = BaseProperty.PATH_TOKENS;

/**
 * Given a list of non-overlapping, unordered segments, each identified by its start point and length,
 * this function computes the longest monotone, increasing sub-sequence of segments.
 *
 * Currently, this is O(n^2) in the worst case, it could be implemented in O(n log n), but I would have
 * to implement a binary search tree for this. If this becomes a bottle-neck, we should replace
 * the insertions and binary searches below, with a search tree.
 *
 * @param {Array.<number>} in_segmentStarts  - The starting points of the segments
 * @param {Array.<number>} in_segmentLengths - The lengths of the segments
 *
 * @return {Array.<Number>} List of the selected segments, given as indices of the segments
 * @private
 */
var _getLongestIncreasingSubsequenceSegments = function(in_segmentStarts, in_segmentLengths) {
    if (in_segmentStarts.length === 0) {
        return [];
    }

    // Contains the already found sub sequences, sorted by their length
    // in increasing order. These sub-sequences have the invariant that
    // the last entry in each of the sequences is smaller than the last
    // entry in longer sequences (so the list is also sorted according to
    // the sequenceLastEntry member of the structs)
    var foundSubSequences = [];

    for (var i = 0; i < in_segmentStarts.length; i++) {
        var currentSegmentStart = in_segmentStarts[i];

        // Perform a binary search to find the largest entry in the list of found sub
        // sequences that has a sequenceEnd that is smaller or equal than currentSegmentStart
        var index = _.sortedIndexBy(foundSubSequences, { sequenceLastEntry: currentSegmentStart }, 'sequenceLastEntry');
        var lastEntry = index > 0 ? foundSubSequences[index - 1] : undefined;

        // Create a new entry that is obtained by concatenating the longest sequence found so far
        // with the new segment
        var newEntry = {
            sequenceLength: in_segmentLengths[i] + (lastEntry ? lastEntry.sequenceLength : 0),
            segmentIndex: i,
            sequenceLastEntry: currentSegmentStart + in_segmentLengths[i] - 1,
            previousEntry: lastEntry,
        };

        // Search for the insertion position for this entry
        var insertionPoint = _.sortedIndexBy(foundSubSequences, newEntry, 'sequenceLength');
        if (foundSubSequences[insertionPoint] !== undefined &&
            foundSubSequences[insertionPoint].sequenceLength === newEntry.sequenceLength) {
            insertionPoint++;
        }

        // We have to delete all entries from the foundSubSequences array, which
        // are shorter, but have a higher sequenceLastEntry (we can do that, since
        // it would be a better choice to use the new entry instead of these old
        // entries). This will preserve the invariant on the foundSubSequences
        // that they are sorted with respect to the sequenceLastEntry.
        var lowerLengthBoundary = newEntry.sequenceLength - in_segmentLengths[i];

        var j = insertionPoint - 1;
        for (; j >= 0 && foundSubSequences[j].sequenceLength > lowerLengthBoundary; j--) {
            if (foundSubSequences[j].sequenceLastEntry >= newEntry.sequenceLastEntry) {
                foundSubSequences.splice(j, 1);
                insertionPoint--;
            }
        }

        // Insert the entry as a new entry into the list of subsequences
        foundSubSequences.splice(insertionPoint, 0, newEntry); // TODO: this should be done via a binary tree
    }

    // This should always be the case, as we checked for empty inputs above
    ConsoleUtils.assert(foundSubSequences.length > 0);

    // Extract the result
    var longestSequence = [];
    var currentSegment = _.last(foundSubSequences);
    while (currentSegment) {
        longestSequence.unshift(currentSegment.segmentIndex);
        currentSegment = currentSegment.previousEntry;
    }

    return longestSequence;
};

export class ArrayProperty extends AbstractStaticCollectionProperty {
    /**
     * Default constructor for ArrayProperty
     * @param {Object} [in_params] - the parameters
     * @param {Number} [in_params.length = 0] the length of the array, if applicable
     * @param {string} [in_scope] - The scope in which the property typeid is defined
     * @protected
     */
    constructor(in_params, in_scope) {
        super(in_params);
        var length = in_params.size || in_params.length || 0;

        // changesets
        this._dirty = undefined;

        // We only need the scope for custom type array properties
        if (!this._isPrimitive) {
            this._scope = in_scope;
        }

        this._dataArrayCreate(length);
    }

    /**
     * Returns the path segment for a child
     *
     * @param {property-properties.BaseProperty} in_childNode - The child for which the path is returned
     *
     * @return {string|undefined} The path segment to resolve the child property under this property
     * @protected
     */
    _getPathSegmentForChildNode(in_childNode) {
        var index = this._dataArrayGetBuffer().indexOf(in_childNode);
        if (index === -1) {
            throw new Error(MSG.GET_PATH_SEGMENT_CALLED_FOR_NON_ENTRY);
        }

        return '[' + index + ']';
    }

    /**
     * Resolves a direct child node based on the given path segment
     *
     * @param {String} in_segment                                   - The path segment to resolve
     * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
     *
     * @return {property-properties.BaseProperty|undefined} The child property that has been resolved
     * @protected
     */
    _resolvePathSegment(in_segment, in_segmentType) {
        // Base Properties only support paths separated via dots
        if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            var index = Math.floor(in_segment);

            // Specifying a non-integer index is regarded a mal-formed path and thus throws an exception
            if (!isFinite(index)) {
                throw new Error(MSG.INVALID_NON_NUMERIC_SEGMENT_IN_PATH + in_segment);
            }

            // Accessing an entry outside of the array is just a non existing property and thus
            // returns undefined
            if (index < 0 || index >= this._dataArrayGetLength()) {
                return undefined;
            }
            return this._dataArrayGetValue(index);
        } else {
            return AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
        }
    }

    /**
     * Insert into the array at a given position.
     * It will not overwrite the existing values, it will push them to the right.
     * @param {number} in_position target index
     * @param {*} in_value inserted value or property
     * @throws if in_position is smaller than zero, larger than the length of the array or not a number.
     * @throws if trying to insert a property that already has a parent.
     * @throws if trying to modify a referenced property.
     * @throws if trying to insert a property that is a root property
     */
    insert(in_position, in_value) {
        this.insertRange(in_position, [in_value]);
    }

    /**
     * Is this property a leaf node with regard to flattening?
     *
     * TODO: Which semantics should flattening have? It stops at primitive types and collections?
     *
     * @return {boolean} True if it is a leaf with regard to flattening?
     */
    _isFlattenLeaf() {
        return true;
    }

    /**
     * Add one or more values at the end of the array
     * @param {Array<property-properties.BaseProperty>|property-properties.BaseProperty|*|Array<*>} in_values
     * the item or items to be pushed (either properties or values). If an array is passed, .push
     *  will be called on each item in the array.
     * @throws if trying to push a property that is a root property
     * @return {number} new length of the array
     */
    push(in_values) {
        if (_.isArray(in_values)) {
            this.insertRange(this._dataArrayGetLength(), in_values);
        } else {
            this.insertRange(this._dataArrayGetLength(), [in_values]);
        }
        return this._dataArrayGetLength();
    }

    /**
     * Add elements to the end of the queue (array)
     */
    enqueue(...args) {
        return this.push(...args);
    }

    /**
     * Add a value at the front of the array or letters to the beginning of a string (for StringProperty)
     * It can also add multiple values to an array if you pass in an array of values.
     * @param {Array<*>|*|Array<property-properties.BaseProperty>|property-properties.BaseProperty} in_values the values
     * or properties to be pushed
     * @throws if trying to insert a property that already has a parent.
     * @throws if trying to insert a root property
     * @throws if trying to modify a referenced property.
     * @return {number} new length of the array
     */
    unshift(in_values) {
        if (_.isArray(in_values)) {
            this.insertRange(0, in_values);
        } else {
            this.insertRange(0, [in_values]);
        }
        return this._dataArrayGetLength();
    }

    /**
     * Removes an element of the array (or a letter in a StringProperty) and shifts remaining elements to the left
     * E.g. [1, 2, 3]   .remove(1) => [1, 3]
     * E.g. (StringProperty) 'ABCDE'  .remove(1) => 'ACDE'
     * @param {number} in_position the index that will be removed
     * @throws if in_position is not a number
     * @throws if trying to remove something that does not exist
     * @throws if trying to remove an item with a parent
     * @return {property-properties.BaseProperty | * } the value that was removed.
     */
    remove(in_position) {
        var value = this.get(in_position);
        this.removeRange(in_position, 1);
        return value;
    }

    /**
     * Removes the last element of the array or the last letter of a string (for StringProperty)
     * @throws if trying to modify a referenced property
     * @return {property-properties.BaseProperty|*} deleted element.
     */
    pop() {
        if (this._dataArrayGetLength() > 0) {
            var item = this.get(this._dataArrayGetLength() - 1,
                { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
            this.remove(this._dataArrayGetLength() - 1);
            return item;
        } else {
            return undefined;
        }
    }

    /**
     * Removes an element from the front of the array or a letter from the beginning of a string (for StringProperty)
     * @return {*|property-properties.BaseProperty} the element removed.
     */
    shift() {
        if (this._dataArrayGetLength() > 0) {
            var item = this.get(0, { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
            this.remove(0);
            return item;
        } else {
            return undefined;
        }
    }

    /**
     * Removes elements from the front of the queue (array)
     */
    dequeue() {
        return this.shift();
    }

    /**
     * Change an existing element of the array. This will overwrite an existing element.
     * E.g. [1, 2, 3]  .set(1, 8) => [1, 8, 3]
     * @param {number} in_position the target index
     * @param {*} in_value the new property or value
     * @throws if in_position is not a number
     * @throws if in_position is smaller than zero
     */
    set(in_position, in_value) {
        if (_.isArray(in_value)) {
            throw new Error(MSG.ARRAY_SET_ONE_ELEMENT + in_value);
        }
        this.setRange(in_position, [in_value]);
    }

    /**
     * Sets the values of items in the array.
     * If values are typed, iterates through the values and creates a property with the defined type and value.
     * @see {setValues}
     * @param {Array<*>} in_values  - The list of typed values.
     * @param {Bool} in_typed  - Whether the values are typed/polymorphic.
     * @param {Bool} in_initial  - Whether we are setting default/initial values
     *   or if the function is called directly with the values to set.
     * @protected
     * @override
     */
    _setValues(in_values, in_typed, in_initial) {
        if (in_typed) {
            if (!this._isPrimitive) {
                ConsoleUtils.assert(_.isArray(in_values), MSG.IN_ARRAY_NOT_ARRAY + 'ArrayProperty._setValues');

                var arr = [];
                for (var i = 0; i < in_values.length; i++) {
                    var prop = in_values[i];

                    if (in_values[i] instanceof BaseProperty) {
                        prop = in_values[i];
                    } else {
                        prop = Property.PropertyFactory._createProperty(
                            in_values[i].typeid || this._typeid, null, in_values[i].value, this._getScope());
                    }
                    arr.push(prop);
                }

                this._setValuesInternal(arr);
            } else {
                AbstractStaticCollectionProperty.prototype._setValues.call(this, in_values, in_typed, in_initial);
            }
        } else {
            this._setValuesInternal(in_values);
        }
    }

    /**
     * @param {Array<*>|Object} in_values an array or object containing the values to be set.
     * @see {setValues}
     */
    _setValuesInternal(in_values) {
        this._checkIsNotReadOnly(true);

        if (!this._isPrimitive) {
            if (_.isArray(in_values)) {
                this.clear();
                this.insertRange(0, in_values);
            } else {
                AbstractStaticCollectionProperty.prototype.setValues.call(this, in_values);
            }
        } else {
            if (_.isArray(in_values) && in_values.length < this._dataArrayGetLength()) {
                this.removeRange(in_values.length, this._dataArrayGetLength() - in_values.length);
            }

            var that = this;
            var maxIndex = this._dataArrayGetLength() - 1;
            _.each(in_values, function(value, index) {
                if (index > maxIndex) {
                    that.insert(index, value);
                } else {
                    if (that._dataArrayGetValue(index) !== value) {
                        that.set(index, value);
                    }
                }
            });
        }
    }

    /**
     * Sets the values of items in the array.
     * If called using an array (e.g. setValues([prop1, prop2])), it will overwrite the whole array.
     * If called using an object with indexes (e.g. setValues{0: prop1}), it will only overwrite the
     * items at those indexes.
     * For arrays of Properties, this can be used to set nested values in properties found in the array.
     * For example: setValues({0: {position: {x: 2, y:3}}});
     * @param {Array<*>|Object} in_values an array or object containing the values to be set.
     * @throws if one of the path in in_values does not correspond to a path in the property
     */
    setValues(in_values) {
        var checkoutView = this._getCheckoutView();
        if (checkoutView !== undefined) {
            checkoutView.pushNotificationDelayScope();
            ArrayProperty.prototype._setValues.call(this, in_values, false, false);
            checkoutView.popNotificationDelayScope();
        } else {
            ArrayProperty.prototype._setValues.call(this, in_values, false, false);
        }
    }

    /**
     * Deletes all values from an array
     */
    clear() {
        if (this.getLength()) {
            this.removeRange(0, this.getLength());
        }
    }

    /**
     * @return {Array<*> | String} all values in the ArrayProperty
     * If called on StringProperty, it returns the whole string
     * WARNING: the returned array must be read only, data written to it
     * will get lost.
     */
    getEntriesReadOnly() {
        return this._dataArrayGetBuffer();
    }

    /**
     * Private helper function to update the internal dirty and pending changes
     * is overwritten by StringProperty
     *
     * @param {property-properties.SerializedChangeSet} in_changeSet - The changeset to apply
     * @private
     */
    _updateChanges(in_changeSet) {
        var pendingChanges = this._getPendingChanges();
        ChangeSet.prototype._performApplyAfterOnPropertyArray(pendingChanges,
            in_changeSet, this.getFullTypeid(true));

        var dirtyChanges = this._getDirtyChanges();
        ChangeSet.prototype._performApplyAfterOnPropertyArray(dirtyChanges,
            in_changeSet, this.getFullTypeid(true));

        this._setChanges(pendingChanges, dirtyChanges);
    }

    /**
     * Returns the pending changeset for this object
     * @return {property-properties.SerializedChangeSet} The pending changes
     */
    _getPendingChanges() {
        return (this._dirty && this._dirty.pending) || {};
    }

    /**
     * Returns the dirty changeset for this object
     * @return {property-properties.SerializedChangeSet} The dirty changes
     */
    _getDirtyChanges() {
        return (this._dirty && this._dirty.dirty) || {};
    }

    /**
     * Sets the pending and dirty changesets
     *
     * @param {property-properties.SerializedChangeSet|undefined|null} in_pending
     *     The pending changeset. If null is passed, no change will be
     *     applied. undefined indicates that the changes should be reset
     * @param {property-properties.SerializedChangeSet|undefined|null} in_dirty
     *     The dirty changeset. If null is passed, no change will be
     *     applied. undefined indicates that the changes should be reset
     */
    _setChanges(in_pending, in_dirty) {
        var oldFlags = this._dirty ? this._dirty.flags : 0;

        if (this._dirty &&
            this._dirty === DIRTY_STATE_FLAGS_ARRAY[this._dirty.flags]) {
            this._dirty = undefined;
        }

        if (in_pending !== null) {
            if (!_.isEmpty(in_pending)) {
                this._dirty = this._dirty || {};
                this._dirty.pending = in_pending;
            } else if (this._dirty) {
                this._dirty.pending = undefined;
            }
        }

        if (in_dirty !== null) {
            if (!_.isEmpty(in_dirty)) {
                this._dirty = this._dirty || {};
                this._dirty.dirty = in_dirty;
            } else if (this._dirty) {
                this._dirty.dirty = undefined;
            }
        }

        if (this._dirty) {
            if (this._dirty.dirty === undefined &&
                this._dirty.pending === undefined) {
                if (oldFlags === 0) {
                    this._dirty = undefined;
                } else {
                    this._dirty = DIRTY_STATE_FLAGS_ARRAY[oldFlags];
                }
            } else {
                this._dirty.flags = oldFlags;
            }
        } else if (oldFlags) {
            this._dirty = DIRTY_STATE_FLAGS_ARRAY[oldFlags];
        }
    }

    /**
     * Sets the dirty flags for this property
     * @param {Number} in_flags The dirty flags
     */
    _setDirtyFlags(in_flags) {
        if (this._dirty) {
            if (this._dirty !== DIRTY_STATE_FLAGS_ARRAY[this._dirty.flags]) {
                this._dirty.flags = in_flags;

                if (this._dirty.dirty === undefined &&
                    this._dirty.pending === undefined &&
                    (this._dirty.flags === 0 || this._dirty.flags === undefined)) {
                    this._dirty = undefined;
                }
            } else {
                this._dirty = DIRTY_STATE_FLAGS_ARRAY[in_flags];
            }
        } else {
            this._dirty = DIRTY_STATE_FLAGS_ARRAY[in_flags];
        }
    }

    /**
     * Gets the dirty flags for this property
     * @return {Number} The dirty flags
     */
    _getDirtyFlags() {
        if (this._dirty === undefined) {
            return 0;
        }

        return this._dirty.flags;
    }

    /**
     * Inserts the content of a given array into the array property
     * It will not overwrite the existing values but push them to the right instead.
     * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
     * @param {number} in_offset target index
     * @param {Array<*>} in_array the array to be inserted
     * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
     * @throws if trying to insert a property that already has a parent.
     * @throws if trying to modify a referenced property.
     * @throws if trying to insert a property that is not an array.
     * @throws if trying to insert a root property.
     */
    insertRange(in_offset, in_array) {
        if (!_.isArray(in_array)) {
            throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'ArrayProperty.insertRange');
        }

        if (validationsEnabled.enabled) {
            for (var i = 0; i < in_array.length; i++) {
                if (in_array[i] instanceof BaseProperty) {
                    in_array[i]._validateInsertIn(this);
                }
            }
            this._checkIsNotReadOnly(true);
        }
        this._insertRangeWithoutDirtying(in_offset, in_array);
        this._setDirty();
    }

    /**
     * inserts the content of a given array, but doesn't dirty the property
     * this is useful for batch changes
     * @param {number} in_offset target index
     * @param {Array<*>} in_array the array to be inserted
     * @param {Boolean=} [in_setParents=true] If true, set parent of inserted properties.
     *                   If false, caller has already set parents.
     * @private
     */
    _insertRangeWithoutDirtying(in_offset, in_array, in_setParents) {
        if (in_setParents === undefined) {
            in_setParents = true;
        }
        if (in_offset < 0 || in_offset > this.length || !_.isNumber(in_offset)) {
            throw Error(MSG.START_OFFSET_INVALID + in_offset);
        }
        if (in_setParents && !this._isPrimitive) {
            var arr = [];
            for (var i = 0; i < in_array.length; ++i) {
                var prop = in_array[i];
                if (!(in_array[i] instanceof BaseProperty)) {
                    prop = Property.PropertyFactory._createProperty(this._typeid, null, in_array[i], this._getScope());
                }

                if (prop.getParent()) {
                    throw new Error(MSG.NO_INSERT_WITH_PARENT);
                } else {
                    prop._setParent(this);
                }
                arr.push(prop);
            }

            in_array = arr;
        }
        this._dataArrayInsertRange(in_offset, in_array);

        // Insert entry into changesets
        var changeSet = {
            'insert': [[in_offset, this._serializeArray(in_array)]],
        };
        this._updateChanges(changeSet);
    }

    /**
     * Removes a given number of elements from the array property (or given number of letters from a StringProperty)
     *  and shifts remaining values to the left.
     * E.g. [1, 2, 3, 4, 5]  .removeRange(1, 3) => [1, 5]
     * @param {number} in_offset target start index
     * @param {number} in_deleteCount number of elements to be deleted
     * @throws if in_offset is not a number
     * @throws if in_deleteCount is not a number
     * @throws if trying to remove an item with a parent
     * @throws if in_offset is smaller than zero or if in_offset + in_delete count is larger than the length of the array
     * @return {Array<*>| Array<property-properties.BaseProperty>} an array containing the values or
     *  properties removed.
     */
    removeRange(in_offset, in_deleteCount) {
        ConsoleUtils.assert(_.isNumber(in_offset), MSG.NOT_NUMBER +
            'in_offset, method: ArrayProperty.removeRange or .remove');
        ConsoleUtils.assert(_.isNumber(in_deleteCount),
            MSG.NOT_NUMBER + 'in_deleteCount, method: ArrayProperty.removeRange or .remove');
        ConsoleUtils.assert(in_offset + in_deleteCount < this.length + 1 && in_offset >= 0 && in_deleteCount > 0,
            MSG.REMOVE_OUT_OF_BOUNDS + 'Cannot remove ' + in_deleteCount + ' items starting at index ' + in_offset);
        var result = [];
        for (var i = in_offset; i < in_offset + in_deleteCount; i++) {
            result.push(this.get(i));
        }
        this._checkIsNotReadOnly(true);
        this._removeRangeWithoutDirtying(in_offset, in_deleteCount);
        this._setDirty();
        return result;
    }

    /**
     * removes a given number of elements from the array property, and ensures, if this is not
     * a primitive array, that any existing properties have their parent pointer cleared.
     * @param {number} in_offset target start index
     * @param {number} in_deleteCount number of elements to be deleted
     * @private
     */
    _clearRange(in_offset, in_deleteCount) {
        if (!this._isPrimitive) {
            for (var i = 0; i < in_deleteCount; ++i) {
                if (this._dataArrayGetValue(in_offset + i).getParent() !== this) {
                    throw new Error(MSG.CANNOT_REMOVE_WITH_DIFFERENT_PARENT);
                } else {
                    this._dataArrayGetValue(in_offset + i)._setParent(undefined);
                }
            }
        }

        this._dataArrayRemoveRange(in_offset, in_deleteCount);
    }

    /**
     * removes a given number of elements from the array property, but doesn't dirty the property
     * this is useful for batch changes
     * @param {number} in_offset target start index
     * @param {number} in_deleteCount number of elements to be deleted
     * @private
     */
    _removeRangeWithoutDirtying(in_offset, in_deleteCount) {
        this._clearRange(in_offset, in_deleteCount);

        // Insert entry into changesets
        var changeSet = {
            'remove': [[in_offset, in_deleteCount]],
        };
        this._updateChanges(changeSet);
    }

    /**
     * Sets the array properties elements to the content of the given array
     * All changed elements must already exist. This will overwrite existing elements.
     * E.g. [1, 2, 3, 4, 5]  .setRange(1, [7, 8]) => [1, 7, 8, 4, 5]
     * @param {number} in_offset target start index
     * @param {Array<*>|Array<property-properties.BaseProperty>} in_array contains the elements to be set
     * @throws if in_offset is not a number
     * @throws if in_offset is smaller than zero or higher than the length of the array
     */
    setRange(in_offset, in_array) {
        if (!_.isArray(in_array) && !_.isString(in_array)) {
            throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'ArrayProperty.setRange');
        }
        in_offset = Math.floor(in_offset);
        if (!isFinite(in_offset)) {
            throw new Error(MSG.NOT_NUMBER + 'in_offset, method: ArrayProperty.setRange or .set');
        }
        ConsoleUtils.assert(in_offset >= -1 && (in_offset + in_array.length) <= this.getLength(),
            MSG.SET_OUT_OF_BOUNDS + 'Cannot set ' + in_array.length + ' items starting at index ' + in_offset +
            '. Array length: ' + this.getLength());
        this._checkIsNotReadOnly(true);
        this._setRangeWithoutDirtying(in_offset, in_array);
        this._setDirty();
    }

    /**
     * sets the array properties elements to the content of the given array
     * all changed elements must already exist. This version doesn't dirty the property,
     * which is useful for batch changes
     * @param {number} in_offset target start index
     * @param {Array<*>} in_array contains the elements to be set
     */
    _setRangeWithoutDirtying(in_offset, in_array) {
        this._modifyRangeWithoutDirtying(in_offset, in_array);
    }

    /**
     * sets the array properties elements to the content of the given array
     * all changed elements must already exist. This version doesn't dirty the property,
     * which is useful for batch changes
     * @param {number} in_offset target start index
     * @param {Array<*>} in_array contains the elements to be set
     */
    _modifyRangeWithoutDirtying(in_offset, in_array) {
        // Has to be overloaded for arrays of properties!
        if (in_offset < 0) {
            throw Error(MSG.START_OFFSET_NEGATIVE + in_offset);
        }
        var changeSet = {};
        var changeArray = [];

        if (!this._isPrimitive) {
            // for custom array properties, we have to do a remove/insert instead:
            this._removeRangeWithoutDirtying(in_offset, in_array.length);
            this._insertRangeWithoutDirtying(in_offset, in_array);
        } else {
            // does the reference array property not have a _dataArrayRef ??
            // go through all the elements of in_array to check if the content of the given array
            // is same as value of the array properties. If the values are same, we don't change it.
            // Otherwise, we set them and generate corresponding changeset.
            var j;
            for (var i = 0; i < in_array.length; i++) {
                if (this._dataArrayGetValue(in_offset + i) !== in_array[i]) {
                    for (j = i + 1; j < in_array.length; j++) {
                        if (this._dataArrayGetValue(in_offset + j) === in_array[j]) {
                            break;
                        }
                    }
                    this._dataArraySetRange(in_offset + i, in_array.slice(i, j));
                    changeArray.push([in_offset + i, this._serializeArray(in_array.slice(i, j))]);
                    i = j;
                }
            }
            changeSet['modify'] = changeArray;
            this._updateChanges(changeSet);
        }
    }

    /**
     * Returns the name of all the sub-properties of this property.
     * Numerical indexes from the array will be returned as strings.
     * E.g. ['0', '1', '2']
     *
     * @return {Array.<string>} An array of all the property ids
     */
    getIds() {
        return Object.keys(this._dataArrayGetBuffer());
    }

    /**
     * Checks whether a property or data exists at the given position.
     *
     * @param {string} in_position - index of the property
     * @return {boolean} True if the property or data exists. Otherwise false.
     */
    has(in_position) {
        return this._dataArrayGetBuffer()[in_position] !== undefined;
    }

    /**
     * Gets the array element at a given index
     * @param {number | array<string|number>} in_position the target index
     * if an array is passed, elements in the array will be treated as part of a path.
     * The first item in an array should be a position in the array.
     * For example, .get([0,'position','x']) is the equivalent of .get(0).get('position').get('x')
     * If it encounters a ReferenceProperty, .get will, by default, resolve the property it refers to.
     * @param {Object} in_options - parameter object
     * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
     *     How should this function behave during reference resolution?
     * @throws if in_position is an array and the first item in the array is not a number
     * @throws if in_position is neither an array nor a number.
     * @throws if in_position is smaller than zero or larger than the length of the array.
     * @return {* | property-properties.BaseProperty | undefined} the element at that index - either a property or a value.
     * or undefined if nothing was found.
     */
    get(in_position, in_options) {
        in_options = in_options || {};
        in_options.referenceResolutionMode =
            in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                in_options.referenceResolutionMode;
        var prop = this;
        if (_.isArray(in_position)) {
            var iterationStart = 0;
            var prop = this;
            if (in_position[0] === PATH_TOKENS.UP) {
                prop = prop.getParent();
                iterationStart = 1;
            } else if (in_position[0] === PATH_TOKENS.ROOT) {
                prop = prop.getRoot();
                iterationStart = 1;
            } else {
                var pos = Math.floor(in_position[0]);
                ConsoleUtils.assert(isFinite(pos), MSG.FIRST_ITEM_MUST_BE_NUMBER);
                var mode = in_options.referenceResolutionMode;
                ConsoleUtils.assert(pos >= 0 && pos < this.getLength(),
                    MSG.GET_OUT_OF_RANGE + in_position[0]);
            }
            for (var i = iterationStart; i < in_position.length && prop; i++) {
                if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS) {
                    mode = i !== in_position.length - 1 ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                        BaseProperty.REFERENCE_RESOLUTION.NEVER;
                }
                if (in_position[i + 1] === PATH_TOKENS.REF) {
                    mode = BaseProperty.REFERENCE_RESOLUTION.NEVER;
                }
                prop = prop.get(in_position[i], { referenceResolutionMode: mode });
                if (prop === undefined && i < in_position.length - 1) {
                    return undefined;
                }
            }
            return prop;
        }

        if (in_position === PATH_TOKENS.ROOT) {
            return prop.getRoot();
        } else if (in_position === PATH_TOKENS.UP) {
            return prop.getParent();
        } else if (in_position === PATH_TOKENS.REF) {
            throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
        } else {
            var pos = Math.floor(in_position);
            ConsoleUtils.assert(isFinite(pos), MSG.IN_POSITION_MUST_BE_NUMBER);
            var result = this._dataArrayGetValue(pos);
            if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
                if (result instanceof Property.ReferenceProperty) {
                    result = result.ref;
                }
            }
            return result;
        }
    }

    /**
     * Returns an object with all the nested values contained in this property
     * @return {array<object> | array<*>} an array of objects or values representing the values of your property
     * for example: [
     * {
     *   position: {
     *    x: 2,
     *    y: 5
     *   }
     * },
     * {
     *   position: {
     *    x: 1,
     *    y: -8
     *  }
     * }]
     * or for a Value Array: [1, 3, 6]
     */
    getValues() {
        var result = [];
        var ids = this.getIds();
        for (var i = 0; i < ids.length; i++) {
            var child = this.get(ids[i]);
            result.push(child.getValues());
        }
        return result;
    }

    /**
     * @return {Number} the current length of the array
     */
    getLength() {
        return this._dataArrayGetLength();
    }

    /**
     * @inheritdoc
     */
    _applyChangeset(in_changeSet, in_reportToView) {
        this._checkIsNotReadOnly(false);

        // Iterator to process the changes in the ChangeSet in the correct order
        var arrayIterator = new ArrayChangeSetIterator(in_changeSet);

        if (!this._isPrimitive) {
            // Successively apply the changes from the changeSet
            while (!arrayIterator.atEnd()) {
                switch (arrayIterator.opDescription.type) {
                    case ArrayChangeSetIterator.types.INSERT:
                        // Handle inserts
                        var propertyDescriptions = arrayIterator.opDescription.operation[1];
                        var insertedPropertyInstances = [];
                        var scope = this._getScope();
                        for (var i = 0; i < propertyDescriptions.length; ++i) {
                            var createdProperty = Property.PropertyFactory._createProperty(
                                propertyDescriptions[i]['typeid'], null, undefined, scope);
                            // Set parent so scope is defined for deserialization
                            createdProperty._setParent(this);
                            createdProperty._deserialize(propertyDescriptions[i], false);
                            insertedPropertyInstances.push(createdProperty);
                        }
                        this._insertRangeWithoutDirtying(arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                            this._deserializeArray(insertedPropertyInstances), false);
                        break;
                    case ArrayChangeSetIterator.types.REMOVE:
                        // Handle removes
                        var numRemoved = arrayIterator.opDescription.operation[1];
                        if (!_.isNumber(numRemoved)) {
                            numRemoved = numRemoved.length;
                        }
                        this._removeRangeWithoutDirtying(arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset, numRemoved);
                        break;
                    case ArrayChangeSetIterator.types.MODIFY:
                        // Handle modifies
                        var propertyDescriptions = arrayIterator.opDescription.operation[1];
                        var startIndex = arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset;
                        for (var i = 0; i < propertyDescriptions.length; ++i) {
                            var modifiedProperty = this.get(startIndex + i,
                                { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
                            if (!modifiedProperty) {
                                throw new Error(MSG.INDEX_INVALID + (startIndex + i));
                            }
                            modifiedProperty._applyChangeset(propertyDescriptions[i], false);
                        }
                        break;
                    default:
                        console.error('applyChangeset: ' + MSG.UNKNOWN_OPERATION + arrayIterator.opDescription.type);
                }
                arrayIterator.next();
            }
        } else {
            // Successively apply the changes from the changeSet
            while (!arrayIterator.atEnd()) {
                switch (arrayIterator.opDescription.type) {
                    case ArrayChangeSetIterator.types.INSERT:
                        // Handle inserts
                        this._insertRangeWithoutDirtying(arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                            this._deserializeArray(arrayIterator.opDescription.operation[1]));
                        break;
                    case ArrayChangeSetIterator.types.REMOVE:
                        // Handle removes
                        var removeLength = arrayIterator.opDescription.operation[1];
                        if (_.isArray(removeLength) || _.isString(removeLength)) {
                            removeLength = removeLength.length;
                        }

                        this._removeRangeWithoutDirtying(arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset, removeLength);
                        break;
                    case ArrayChangeSetIterator.types.MODIFY:
                        // Handle modifies
                        this._modifyRangeWithoutDirtying(arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                            this._deserializeArray(arrayIterator.opDescription.operation[1]));
                        break;
                    default:
                        console.error('applyChangeset: ' + MSG.UNKNOWN_OPERATION + arrayIterator.opDescription.type);
                }
                arrayIterator.next();
            }
        }

        // Finally mark the property as dirty (we postponed this in the previous operations to prevent multiple triggering
        // of dirtying events)
        this._setDirty(in_reportToView);
    }

    /**
     * @inheritdoc
     */
    _reapplyDirtyFlags(in_pendingChangeSet, in_dirtyChangeSet) {
        this._checkIsNotReadOnly(false);

        this._setChanges(in_pendingChangeSet, in_dirtyChangeSet);
        // Finally mark the property as dirty (we postponed this in the previous operations to prevent multiple triggering
        // of dirtying events)
        this._setDirty(false);
    }

    /**
     * Removes the dirtiness flag from this property
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean, if none are supplied all
     *                                                                       will be removed
     * @private
     */
    _cleanDirty(in_flags) {
        // Invoke parent - cleans own dirty flag
        BaseProperty.prototype._cleanDirty.call(this, in_flags);

        // null means no change, undefined means reset the changes
        var pendingChanges = null,
            dirtyChanges = null;

        if (in_flags === undefined ||
            (in_flags & BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE) !== 0) {
            pendingChanges = undefined;
        }
        if (in_flags === undefined ||
            (in_flags & BaseProperty.MODIFIED_STATE_FLAGS.DIRTY) !== 0) {
            dirtyChanges = undefined;
        }

        this._setChanges(pendingChanges, dirtyChanges);
    }

    /**
     * Removes the dirtiness flag from this property and recursively from all of its children
     *
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] - The flags to clean,
     * if none are supplied all will be removed
     */
    cleanDirty(in_dirtinessType) {
        if (!this._isPrimitive) {
            for (var i = 0; i < this._dataArrayGetLength(); ++i) {
                this._dataArrayGetValue(i).cleanDirty(in_dirtinessType);
            }
        }
        // after all paths are clean, we are also clean!
        this._cleanDirty(in_dirtinessType);
    }

    /**
     * Internal helper function that implements the deserialize algorithm for an array of named properties.
     *
     * @param {property-properties.SerializedChangeSet} in_serializedObj - The serialized changeset to apply. This
     *     has to be a normalized change-set (only containing inserts. Removes and Modifies are forbidden).
     * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
     *                                             and trigger a modified event there. When batching updates, this
     *                                             can be prevented via this flag.
     * @return {property-properties.SerializedChangeSet} ChangeSet with the changes that actually were performed during the
     *     deserialization
     */
    _deserializeNamedPropertyArray(in_serializedObj, in_reportToView) {
        if (!_.isArray(in_serializedObj.insert[0][1])) {
            throw new Error(MSG.INVALID_CHANGESET);
        }

        // When the array contains named properties, we can use an efficient diffing algorithm, which
        // takes advantage of the ability to identify entries in an unique way
        var targetArray = in_serializedObj.insert[0][1];

        // The algorithm below finds the mapping between the two given arrays which requires the smallest number of
        // inserted and removed entries. These operations are determined via the following strategy:
        // 1) We search for all consecutive segments in the input data, which map to a consecutive segments in the
        //    target array.
        // 2) We search for the longest sequence of consecutive segments in the input data which are all starting at
        //    monotone increasing points in the target array. These are the segments which will remain unmodified
        //    by insertion/removals
        // 3) Finally, we determine the necessary insertion and remove operations to fill in/remove the entries between
        //    these segments and compute modify instructions within the segments.

        // 1) Map the GUIDs in the input ChangeSet to indices
        var resultGuidToIndexMap = {};
        for (var i = 0; i < targetArray.length; i++) {
            var insertedProperty = targetArray[i];
            if (insertedProperty['String'] === undefined ||
                insertedProperty['String']['guid'] === undefined) {
                throw new Error(MSG.MISSING_GUID_IN_NORMALIZED_CHANGESET);
            }

            var guid = insertedProperty['String']['guid'];
            // since the spec allows alternatively other changeset formats for strings, we have to support them here:
            if (!_.isString(guid) && insertedProperty['String']['guid'].insert) {
                guid = insertedProperty['String']['guid'].insert[0][1];
            }
            resultGuidToIndexMap[guid] = i;
        }

        var initialArrayLength = this._dataArrayGetLength();

        // Collect consecutive segments
        var segmentStartPointsInInitialArray = [];
        var segmentStartPointsInTargetArray = [];
        var segmentLengths = [];
        var segmentInterrupted = false;
        for (var i = 0; i < initialArrayLength; i++) {
            // Get the GUID of the entry
            var guid = this._dataArrayGetValue(i).getGuid();

            // Check where it is stored in the target array
            var index = resultGuidToIndexMap[guid];
            if (index !== undefined) {
                // Check whether we can append the entry to the existing sequence
                if (!segmentInterrupted &&
                    segmentStartPointsInTargetArray.length > 0 &&
                    _.last(segmentStartPointsInTargetArray) + _.last(segmentLengths) === index) {
                    // In that case we just increase the length of the segment
                    segmentLengths[segmentLengths.length - 1]++;
                } else {
                    // Create a new segment
                    segmentStartPointsInInitialArray.push(i);
                    segmentStartPointsInTargetArray.push(index);
                    segmentLengths.push(1);
                    segmentInterrupted = false;
                }
            } else {
                segmentInterrupted = true;
            }
        }

        // 2) Get all segments in the array which we will keep (we try to keep as many as possible, so this maps
        // to finding the longest monotone increasing sequence of sub-segments)
        var orderedSegments = _getLongestIncreasingSubsequenceSegments(segmentStartPointsInTargetArray, segmentLengths);

        // 3) Now we have to convert this sequence of ordered segments to insert and remove commands
        var changes = {};

        var lastPositionInInitialArray = 0;
        var lastPositionInTargetArray = 0;
        var offset = 0;
        for (var i = 0; i <= orderedSegments.length; i++) {
            var startPointInInitialArray, startPointInTargetArray, segmentLength;
            var offsetChange = 0;
            if (i < orderedSegments.length) {
                // Extract the information about the currently processed segment.
                startPointInInitialArray = segmentStartPointsInInitialArray[orderedSegments[i]];
                startPointInTargetArray = segmentStartPointsInTargetArray[orderedSegments[i]];
                segmentLength = segmentLengths[orderedSegments[i]];
            } else {
                // Special case to handle the end of the sequence: We add a segment of length 0 at the end
                startPointInInitialArray = initialArrayLength;
                startPointInTargetArray = targetArray.length;
                segmentLength = 0;
            }

            // If the start point of the segment in the initial array is larger than the last point we processed, we have
            // to remove the elements between the two points
            if (startPointInInitialArray > lastPositionInInitialArray) {
                changes.remove = changes.remove || [];
                changes.remove.push([lastPositionInInitialArray, startPointInInitialArray - lastPositionInInitialArray]);
                this._removeRangeWithoutDirtying(lastPositionInInitialArray + offset,
                    startPointInInitialArray - lastPositionInInitialArray);
                offsetChange -= startPointInInitialArray - lastPositionInInitialArray;
            }

            // If the start point of the segment in the target array is larger than the last point we processed, we have
            // to insert the elements between the two points
            if (startPointInTargetArray > lastPositionInTargetArray) {
                changes.insert = changes.insert || [];
                let elementsToInsert = targetArray.slice(lastPositionInTargetArray, startPointInTargetArray);
                changes.insert.push([
                    lastPositionInInitialArray,
                    deepCopy(elementsToInsert),
                ]);
                var scope = this._getScope();
                var insertedProperties = deserializeNonPrimitiveArrayElements(elementsToInsert, scope);
                this._insertRangeWithoutDirtying(lastPositionInInitialArray + offset, insertedProperties);
                offsetChange += insertedProperties.length;
            }

            // Update the last processed points
            lastPositionInInitialArray = startPointInInitialArray + segmentLength;
            lastPositionInTargetArray = startPointInTargetArray + segmentLength;
            offset += offsetChange;

            // Recursively check the entries within the segment for modifications
            for (var j = 0; j < segmentLength; j++) {
                var existingEntry = this._dataArrayGetValue(startPointInInitialArray + j + offset);
                var entryChanges = existingEntry._deserialize(targetArray[startPointInTargetArray + j],
                                                              false, undefined, true);

                // We had changes which we have to report back
                if (!ChangeSet.isEmptyChangeSet(entryChanges)) {
                    // Make sure, the ChangeSet contains the typeid of the modified entry
                    entryChanges.typeid = existingEntry.getFullTypeid();

                    if (!changes.modify) {
                        changes.modify = [[startPointInInitialArray + j, [entryChanges]]];
                    } else {
                        var lastModifiedSequence = _.last(changes.modify);
                        if (lastModifiedSequence[0] + lastModifiedSequence[1].length === startPointInInitialArray + j) {
                            lastModifiedSequence[1].push(entryChanges);
                        } else {
                            changes.modify.push([startPointInInitialArray + j, [entryChanges]]);
                        }
                    }
                }
            }
        }

        // If there were any changes, we have to mark this property as dirty
        if (!ChangeSet.isEmptyChangeSet(changes)) {
            this._setDirty(in_reportToView);
        }
        return changes;
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
        // we have to convert the propertySet objects to changesets
        return in_obj._serialize(false, true);
    }

    /**
     * Function to serialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on serialization. For supported types, we can just return the input here.
     *
     * @param {Array} in_array - The array of special objects to be serialized
     * @return {Array<property-properties.SerializedChangeSet>} the serialized object
     */
    _serializeArray(in_array) {
        var len = in_array.length;
        var result = new Array(len);
    if (this._isPrimitive) {
        for (var i = 0; i < len; i++) {
            result[i] = this._serializeValue(in_array[i]);
        }
    } else {
        for (var i = 0; i < len; i++) {
            result[i] = {};
        }
    }
        return result;
    }

    /**
     * Function to deserialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on deserialization. For supported types, we can just return the input here.
     *
     * @param {Array<property-properties.SerializedChangeSet>} in_serializedObj the serialized object
     * @return {Array} in_array - The array of special objects that were deserialized
     */
    _deserializeArray(in_serializedObj) {
        return in_serializedObj;
    }

    /**
     * @inheritdoc
     */
    _deserialize(in_serializedObj, in_reportToView, in_filteringOptions, in_createChangeSet) {
        this._checkIsNotReadOnly(false);

        if ((in_serializedObj.remove && in_serializedObj.remove.length > 0) ||
            (in_serializedObj.modify && in_serializedObj.modify.length > 0) ||
            (in_serializedObj.insert &&
                (in_serializedObj.insert.length > 1 ||
                    (in_serializedObj.insert.length === 1 &&
                        (in_serializedObj.insert[0][0] !== 0 ||
                            !_.isArray(in_serializedObj.insert[0][1])))))) {
            throw new Error(MSG.NO_NORMALIZED_CHANGESET);
        }

        var arrayLength = this._dataArrayGetLength();

        if (!in_serializedObj.insert ||
            !in_serializedObj.insert[0]) {
            // we've got an empty object, so we have to wipe everything we've got
            if (arrayLength > 0) {
                this._clearRange(0, arrayLength);
                this._setDirty(in_reportToView);
                var removeChangeSet = {
                    remove: [[0, arrayLength]],
                };
                this._updateChanges(removeChangeSet);
                return removeChangeSet;
            } else {
                // the array was already empty, nothing has changed
                return {};
            }
        }

        var scope = this._getScope();

        if (Property.PropertyFactory.inheritsFrom(this.getTypeid(), 'NamedProperty', { scope: scope })) {
            return this._deserializeNamedPropertyArray(in_serializedObj, in_reportToView);
        } else {
            // most simplistic diff method: Remove all existing data and insert the new data

            // The changes we will report as result of this function
            var simpleChanges = {
                insert: in_createChangeSet ? deepCopy(in_serializedObj.insert) : in_serializedObj.insert,
            };
            if (arrayLength > 0) {
                simpleChanges.remove = [[0, arrayLength]];
            }

            if (!this._isPrimitive) {
                var propertyDescriptions = in_serializedObj.insert[0][1];
                var result = [];

                for (var i = 0; i < propertyDescriptions.length; ++i) {
                    var createdProperty = Property.PropertyFactory._createProperty(
                        propertyDescriptions[i]['typeid'], null, undefined, scope);
                    createdProperty._setParent(this);
                    createdProperty._deserialize(propertyDescriptions[i], false, in_filteringOptions, false);
                    result.push(createdProperty);
                }
                this._clearRange(0, this._dataArrayGetLength());
                this._dataArrayInsertRange(0, result);
            } else {
                // Check, whether there has been any change in the array at all
                if (in_serializedObj.insert[0][1].length === this._dataArrayGetLength()) {
                    // We have to compare the two buffers
                    var buffer = this._dataArrayGetBuffer();
                    var changeSetArray = in_serializedObj.insert[0][1];
                    var len = buffer.length;
                    var i = 0;
                    if (this._typeid === 'Int64' || this._typeid === 'Uint64') {
                        // For (u)int64, we will compare (Ui/I)nt64 objects with arrays [low, high]
                        for (i = 0; i < len; i++) {
                            if (changeSetArray[i][0] !== buffer[i].getValueLow() || changeSetArray[i][1] !== buffer[i].getValueHigh()) {
                                break;
                            }
                        }
                    } else {
                        for (i = 0; i < len; i++) {
                            if (buffer[i] !== changeSetArray[i]) {
                                break;
                            }
                        }
                    }
                    if (i === len) {
                        return {};
                    }
                }
                // set the actual array values to our array
                this._dataArrayDeserialize(this._deserializeArray(in_serializedObj.insert[0][1]));
            }

            // Update the dirty and pending changes
            this._updateChanges(simpleChanges);

            // Finally report the dirtiness to the view (we postponed this above)
            this._setDirty(in_reportToView);

            return simpleChanges;
        }
    }

    _getChangesetForCustomTypeArray(in_basePropertyChangeset,
        in_dirtinessType,
        in_includeReferencedRepositories) {
        var result = {};
        if (in_basePropertyChangeset.remove && in_basePropertyChangeset.remove.length > 0) {
            result.remove = deepCopy(in_basePropertyChangeset.remove);
        }
        // get the iterator over the changes:
        var iterator = new ArrayChangeSetIterator(in_basePropertyChangeset);
        var currentArrayIndex = 0;
        var currentArraySize = this._dataArrayGetLength();
        var op, opStartIndex;
        while (!iterator.atEnd() || currentArrayIndex < currentArraySize) {
            if (!iterator.atEnd()) {
                op = iterator.opDescription;
                opStartIndex = op.operation[0] + op.offset;
            } else {
                // no more ops
                op = { offset: iterator.opDescription.offset };
                opStartIndex = Number.MAX_VALUE;
            }

            if (currentArrayIndex < opStartIndex) {
                // not in the influence of an insert or remove

                // we have to check if the element was modified (since that is not tracked)
                if (this._dataArrayGetValue(currentArrayIndex)._isDirty(in_dirtinessType)) {
                    // check if we can combine modifies:
                    var lastModify = undefined;
                    if (result.modify && result.modify.length > 0) {
                        lastModify = result.modify[result.modify.length - 1];
                        if (lastModify[0] + lastModify[1].length === currentArrayIndex - op.offset) {
                            // we need to combine, keep lastModify
                        } else {
                            lastModify = undefined;
                        }
                    }

                    if (lastModify) {
                        lastModify[1].push(this._dataArrayGetValue(currentArrayIndex).serialize(
                            {
                                'dirtyOnly': true, 'includeRootTypeid': true, 'dirtinessType': in_dirtinessType,
                                'includeReferencedRepositories': in_includeReferencedRepositories,
                            }));
                    } else {
                        // begin new modify
                        if (!result.modify) {
                            result.modify = [];
                        }
                        result.modify.push([currentArrayIndex - op.offset,
                        [this._dataArrayGetValue(currentArrayIndex).serialize(
                            {
                                'dirtyOnly': true, 'includeRootTypeid': true, 'dirtinessType': in_dirtinessType,
                                'includeReferencedRepositories': in_includeReferencedRepositories,
                            })]]);
                    }
                    currentArrayIndex++;
                    // add more immediate modifies if possible
                    while (currentArrayIndex < currentArraySize && currentArrayIndex < opStartIndex &&
                        this._dataArrayGetValue(currentArrayIndex)._isDirty(in_dirtinessType)) {
                        result.modify[result.modify.length - 1][1].push(
                            this._dataArrayGetValue(currentArrayIndex).serialize(
                                {
                                    'dirtyOnly': true, 'includeRootTypeid': true, 'dirtinessType': in_dirtinessType,
                                    'includeReferencedRepositories': in_includeReferencedRepositories,
                                }),
                        );
                        currentArrayIndex++;
                    }
                } else {
                    currentArrayIndex++;
                }
            } else if (currentArrayIndex === opStartIndex) {
                // handle the op
                if (op.type === ArrayChangeSetIterator.types.REMOVE) {
                    // no need to do something (removes are just copied)
                    iterator.next(); // we've completely consumed that op
                } else if (op.type === ArrayChangeSetIterator.types.INSERT) {
                    // we have to convert the inserts:
                    var currentInsert = op.operation;
                    var newInsert = [currentInsert[0], []];
                    for (var j = 0; j < currentInsert[1].length; ++j) {
                        // TODO: we don't use the data from the changeset anymore, since we directly
                        // TODO: read the data from the array now - remove the data from the op and
                        // TODO: replace it with just the length instead
                        if (!this._dataArrayGetValue(opStartIndex + j)) {
                            throw new Error('insert: invalid index');
                        }
                        newInsert[1].push(this._dataArrayGetValue(opStartIndex + j).serialize(
                            {
                                'dirtyOnly': false, 'includeRootTypeid': true, 'dirtinessType': in_dirtinessType,
                                'includeReferencedRepositories': in_includeReferencedRepositories,
                            }));
                    }
                    if (!result.insert) {
                        result.insert = [];
                    }
                    result.insert.push(newInsert);
                    currentArrayIndex += currentInsert[1].length; // we've read and used these entries above
                    iterator.next(); // we've completely consumed that op
                } else if (op.type === ArrayChangeSetIterator.types.MODIFY) {
                    // Prevent from looping infinitly
                    // TODO: Might want to decide if there's something to do here
                    iterator.next(); // we've completely consumed that op
                }
            }
        }
        return result;
    }

    /**
     * Serialize the property
     *
     * @param {boolean} in_dirtyOnly -
     *     Only include dirty entries in the serialization
     * @param {boolean} in_includeRootTypeid -
     *     Include the typeid of the root of the hierarchy - has no effect for ArrayProperty
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
     *     The type of dirtiness to use when reporting dirty changes. By default this is
     *     PENDING_CHANGE
     * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the _serialize
     *     function will descend into referenced repositories. WARNING: if there are loops in the references
     *     this can result in an infinite loop
     *
     *
     * @return {Object} The serialized representation of this property
     * @private
     */
    _serialize(in_dirtyOnly, in_includeRootTypeid,
        in_dirtinessType, in_includeReferencedRepositories) {
        var result = AbstractStaticCollectionProperty.prototype._serialize.call(this, in_dirtyOnly, in_includeRootTypeid,
            in_dirtinessType, in_includeReferencedRepositories);

        if (!this._isPrimitive) {
            if (in_dirtyOnly) {
                _.extend(result, in_dirtinessType === BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE ?
                    this._getChangesetForCustomTypeArray(this._getPendingChanges(), in_dirtinessType,
                        in_includeReferencedRepositories) :
                    this._getChangesetForCustomTypeArray(this._getDirtyChanges(), in_dirtinessType,
                        in_includeReferencedRepositories));

                return result;
            } else {
                // returns just an insert with the current data
                if (this._dataArrayGetLength() > 0) {
                    result.insert = [];
                    result.insert.push([0, []]);
                    // we have to convert the propertySet objects to changesets
                    for (var i = 0; i < this._dataArrayGetLength(); i++) {
                        result.insert[0][1].push(this._dataArrayGetValue(i)._serialize(false, true, in_dirtinessType,
                            in_includeReferencedRepositories));
                    }
                }
                return result;
            }
        } else if (in_dirtyOnly) {
            return in_dirtinessType === BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE ?
                deepCopy(this._getPendingChanges()) : deepCopy(this._getDirtyChanges());
        } else {
            // returns just an insert with the current data
            if (this._dataArrayGetLength() > 0) {
                result.insert = [];
                result.insert.push([0, []]);
                for (var i = 0; i < this._dataArrayGetLength(); i++) {
                    result.insert[0][1].push(this._serializeValue(this._dataArrayGetValue(i)));
                }
            }
            return result;
        }
    }

    /**
     * Repeatedly calls back the given function with human-readable string
     * representations of the property and of its sub-properties.
     * @param {string} indent - Leading spaces to create the tree representation
     * @param {string} externalId - Name of the current property at the upper level.
     *                              Used for arrays.
     * @param {function} printFct - Function to call for printing each property
     */
    _prettyPrint(indent, externalId, printFct) {
        printFct(indent + externalId + this.getId() + ' (Array of ' + this.getTypeid() + '): [');
        if (!this._isPrimitive) {
            this._prettyPrintChildren(indent, printFct);
        } else {
            var childIndent = indent + '  ';
            var prefix = '';
            var suffix = '';
            if (this.getTypeid() === 'String') {
                prefix = '"';
                suffix = '"';
            }
            for (var i = 0; i < this._dataArrayGetLength(); i++) {
                printFct(childIndent + i + ': ' + prefix + this._dataArrayGetValue(i) + suffix);
            }
        }
        printFct(indent + ']');
    }

    /**
     * Repeatedly calls back the given function with human-readable string
     * representations of the property's sub-properties.
     * @param {string} indent - Leading spaces to create the tree representation
     * @param {function} printFct - Function to call for printing each property
     */
    _prettyPrintChildren(indent, printFct) {
        indent += '  ';
        var ids = this.getIds();
        for (var i = 0; i < ids.length; i++) {
            this.get(ids[i], { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })
                ._prettyPrint(indent, ids[i] + ': ', printFct);
        }
    }

    /**
     * Return a JSON representation of the array and its items.
     * @return {object} A JSON representation of the array and its items.
     * @private
     */
    _toJson() {
        var json = {
            id: this.getId(),
            context: this._context,
            typeid: this.getTypeid(),
            isConstant: this._isConstant,
            value: [],
        };

        if (!this._isPrimitive) {
            var ids = this.getIds();
            for (var i = 0; i < ids.length; i++) {
                json.value.push(
                    this.get(ids[i], { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER })._toJson(),
                );
            }
        } else {
            json.value = this.getValues();
        }

        return json;
    }

    /**
     * Returns the full property type identifier for the ChangeSet including the array type id, if not
     * omitted by parameters
     * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
     * @return {string} The typeid
     */
    getFullTypeid(in_hideCollection) {
        if (in_hideCollection) {
            return this._typeid;
        } else {
            return TypeIdHelper.createSerializationTypeId(this._typeid, 'array');
        }
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length      the initial length of the array
     */
    _dataArrayCreate(in_length) {
        // This really creates a generic array for custom type arrays. For primitive arrays, like
        // 'StringArrayProperty' or 'Float32ArrayProperty', you need to overload this function.
        this._dataArrayRef = new UniversalDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            var element = Property.PropertyFactory._createProperty(this.getTypeid(), null, undefined, this._scope);
            element._setParent(this);
            this._dataArraySetValue(i, element);
        }
    }

    /**
     * Returns the length of the data array
     * @return {Number} The length
     */
    _dataArrayGetLength() {
        return this._dataArrayRef.length;
    }

    /**
     * Returns the data array's internal buffer
     * @return {Array} The buffer
     */
    _dataArrayGetBuffer() {
        return this._dataArrayRef.getBuffer();
    }

    /**
     * Returns an entry from the data array
     * @param {Number} in_index - Position in the array
     *
     * @return {*} The value at index in_index
     */
    _dataArrayGetValue(in_index) {
        return this._dataArrayRef.getValue(in_index);
    }

    /**
     * Sets an entry in the data array
     * @param {Number} in_index - Position in the array
     * @param {*}      in_value - The new value at index in_index
     */
    _dataArraySetValue(in_index, in_value) {
        this._dataArrayRef.setValue(in_index, in_value);
    }

    /**
     * Set the array to the given new array
     * @param {Array} in_newArray - The new contents of the array
     */
    _dataArrayDeserialize(in_newArray) {
        this._dataArrayRef.deserialize(in_newArray);
    }

    /**
     * Inserts a range into the data array
     * @param {Number} in_position - Position at which the insert should be done
     * @param {Array} in_range     - The array to insert
     */
    _dataArrayInsertRange(in_position, in_range) {
        this._dataArrayRef.insertRange(in_position, in_range);
    }

    /**
     * Removes a range from the data array
     * @param {Number} in_position - Position at which to start the removal
     * @param {Number} in_length   - The number of entries to remove
     */
    _dataArrayRemoveRange(in_position, in_length) {
        this._dataArrayRef.removeRange(in_position, in_length);
    }

    /**
     * Overwrites a range in the data array
     * @param {Number} in_position - Position at which to start the removal
     * @param {Array} in_range     - The array to overwrite
     */
    _dataArraySetRange(in_position, in_range) {
        this._dataArrayRef.set(in_position, in_range);
    }

    /**
     * Get the scope to which this property belongs to.
     * @return {string|undefined} The guid representing the scope in which the
     * map belongs to. If there is a workspace scope return it, else return the scope of this array.
     * @override
     * @private
     */
    _getScope() {
        var scope = AbstractStaticCollectionProperty.prototype._getScope.call(this);

        if (scope !== undefined) {
            return scope;
        } else {
            return this._scope;
        }
    }

    /**
     * returns the length of the current array property
     */
    get length() {
        return this.getLength();
    }
    set length(len) {
        throw new Error(MSG.MODIFY_READ_ONLY);
    }
}

ArrayProperty.prototype._staticChildren = {};
ArrayProperty.prototype._context = 'array';
