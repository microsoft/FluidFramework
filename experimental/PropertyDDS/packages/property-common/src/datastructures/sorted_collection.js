/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Declaration of the SortedCollection class
 */
(function() {
  var Collection = require('./collection');
  var _ = require('lodash');

  /**
   * A sorted collection class.
   * @param {string=} in_name a friendly name to describe this collection. If undefined
   * the collection will have a default "Untitled Collection" assigned to its name.
   * @param {function=} in_type optional parameter pointing to the constructor
   * of a type this Collection will host.
   * @constructor
   * @alias property-common.Datastructures.SortedCollection
   * @extends property-common.Datastructures.Collection
   * @private
   */
  var SortedCollection = function(in_name, in_type) {
    Collection.call(this, in_name, in_type);

    this._comparisonFunction = undefined;
    this._sortedKeys = [];
  };

  SortedCollection.prototype = Object.create(Collection.prototype);

  /**
   * Set the comparison function. By default the keys will be sorted wrt their ASCII code.
   * @param {function(string, string)} in_fn The function to compare two entries.
   *  the return value of this function must convey to the following cases:
   *  - if a > b, then the return value must be greater than 0
   *  - if a < b, then the return value must be less than 0
   *  - if a == b, then the return value must be 0
   */
  SortedCollection.prototype.setComparisonFunction = function(in_fn) {
    console.assert(_.isFunction(in_fn), 'Must provide a function');
    this._comparisonFunction = in_fn;
  };

  /**
   * Add an item to the collection. Sort the list of keys in an ascending order.
   * @param {string|number} in_key Key to store the value under
   * @param {object} in_value Value to store in the collection
   * @return {object} Return the value passed in
   */
  SortedCollection.prototype.add = function(in_key, in_value) {
    var toReturn = Collection.prototype.add.call(this, in_key, in_value);

    this._sortedKeys.push(in_key.toString());
    this._sortedKeys.sort(this._comparisonFunction);

    return toReturn;
  };

  /**
   * Remove an item from this Collection. This method returns a Boolean indicating
   * the success or failure of the removal. This is practical because if we were
   * to throw an error when the key doesn't exist, it would require additional
   * checks by the caller to make sure this key exists prior to removal. Which
   * would make the attempt of removal more verbose and also costly because the
   * caller would have to keep a list – somewhere else – of the things he can
   * and cannot remove.
   *
   * @param {string|number} in_key the key we wish to remove
   * @return {boolean} true if the key exists and was removed, false otherwise.
   */
  SortedCollection.prototype.remove = function(in_key) {
    var toReturn = Collection.prototype.remove.call(this, in_key);

    this._sortedKeys = _.without(this._sortedKeys, in_key);

    return toReturn;
  };

  /**
   * Copy the items of in_collection to this collection.
   * @return {property-common.Datastructures.SortedCollection} cloned SortedCollection
   */
  SortedCollection.prototype.clone = function() {
    var newCol = new SortedCollection(this._name, this._type);
    newCol.setComparisonFunction(this._comparisonFunction);
    newCol.bulkAdd( this._items );
    return newCol;
  };

  /**
   * Internal function use to search (binary search) for the nearest index that
   * the given key would be inserted.
   * i.e. given the array [10, 20, 30, 40, 50] the index that 35 should be inserted at is 3
   * @param {Array<*>} in_array - Target array
   * @param {string} in_key - Key to check against
   * @return {number} The index at which the key would be inserted in
   * @private
   */
  SortedCollection.prototype._binarySearchNearestIndex = function(in_array, in_key) {
    if (!this._comparisonFunction) {
      return _.sortedIndex(in_array, in_key);
    }

    var middleIndex = Math.floor((in_array.length - 1) / 2);

    if (middleIndex < 0) {
      return 0;
    }

    if (this._comparisonFunction(in_array[middleIndex], in_key) > 0) {
      if (in_array.length === 1) {
        return 0;
      }

      return this._binarySearchNearestIndex(in_array.slice(0, middleIndex), in_key);
    }

    if (this._comparisonFunction(in_array[middleIndex], in_key) < 0) {
      if (in_array.length === 1) {
        return 1;
      }

      return (middleIndex + 1) + this._binarySearchNearestIndex(
        in_array.slice(middleIndex + 1, in_array.length),
        in_key
      );
    }

    return middleIndex;
  };

  /**
   * Return the nearest next item to the given key i.e.
   * For the given list of keys ['1.0.1', '2.0.0', '2.2.0', '7.0.1'] the nearest next item to 6.0.1 is
   * the item mapped by '7.0.1'
   * @param {string|number} in_key The key to check against in order to get the nearest next item
   * @return {*|undefined} The nearest next item
   */
  SortedCollection.prototype.getNearestNextItem = function(in_key) {
    var closestNextIndex = this._binarySearchNearestIndex(this._sortedKeys, in_key.toString());
    if (closestNextIndex === this.getCount()) {
      return undefined;
    } else {
      return this.item(this._sortedKeys[closestNextIndex]);
    }
  };

  /**
   * Return the nearest previous item to the given key i.e.
   * For the given list of keys ['1.0.1', '2.0.0', '2.2.0', '7.0.1'] the nearest previous item to 6.0.1 is
   * the item mapped by '7.0.1'
   * @param {string|number} in_key The key to check against in order to get the nearest previous item
   * @return {*|undefined} The nearest previous item
   */
  SortedCollection.prototype.getNearestPreviousItem = function(in_key) {
    var closestPreviousIndex = this._binarySearchNearestIndex(this._sortedKeys, in_key.toString());
    if (closestPreviousIndex === 0) {
      return undefined;
    } else {
      return this.item(this._sortedKeys[closestPreviousIndex - 1]);
    }
  };

  module.exports = SortedCollection;
})();
