/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */
/**
 * @fileoverview Collection class definition
 * @module Core
 * @private
 */
(function() {
  var _ = require('lodash');

  var MSGS = {
    TYPE_MISMATCH: 'Type does not match this collection type',
    KEY_ALREADY_EXISTS: 'Collection key already exists. ',
    KEY_DOES_NOT_EXIST: 'Collection key does not exist in this collection.',
    MUST_GIVE_KEY: 'Collection missing key.',
    MUST_GIVE_VALUE: 'Collection missing value.',
    KEY_NOT_VALID: 'Key must be of type String or Number'
  };

  /**
   * @classdesc Use in_type to make this a typed Collection.
   * @param {string=} in_name a friendly name to describe this collection. If undefined
   * the collection will have a default "Untitled Collection" assigned to its name.
   * @param {function=} in_type optional parameter pointing to the constructor
   * of a type this Collection will host.
   * @constructor
   * @private
   * @alias property-common.Datastructures.Collection
   */
  var Collection = function(in_name, in_type) {

    in_name = in_name || 'Untitled Collection';

    this._type = in_type;
    this._name = in_name;
    this._items = {};

    /**
     * A ordered arrray of keys
     * @type {Array<String|Number>}
     */
    this._order = [];
    this._firstItem = undefined;

    // Pass-thru binding handles
    this.onAdd = function( in_key, in_value ) {};
    this.onRemove = function( in_key, in_value ) {};
    this.onClear = function( in_items ) {};

    var that = this;

    Object.defineProperty(
      this,
      'items',
      {
        get: function() {
          return that._items;
        }
      }
    );
  };

  Collection.prototype.constructor = Collection;

  /**
   * @param {Number|String|CONSTANTS.TUID} in_key Key to store the value under
   * @param {object} in_value Value to store in the collection
   * @return {object} Return the value passed in
   */
  Collection.prototype.add = function( in_key, in_value ) {

    this._checkType( in_value );
    this._checkKey( in_key );
    this._checkIsNewKey( in_key );

    this._items[ in_key ] = in_value;
    this._order.push(in_key);

    this.onAdd( in_key, in_value );

    return in_value;
  };

  /**
   * Bulk add items.
   * @param {object} in_items List of key-value pairs to be stored in the collection
   * @return {object} this collection after add
   */
  Collection.prototype.bulkAdd = function( in_items ) {
    var that = this;
    _.each(in_items, function(item, key) {
      that.add(key, item);
    });

    return this;
  };

  /**
   * Bulk remove items.
   * @param {object} in_items List of key-value items to be removed
   * @return {object} this collection after add
   */
  Collection.prototype.bulkRemove = function( in_items ) {
    var that = this;
    _.each(in_items, function(item, key) {
      that.remove(key);
    });

    return this;
  };

  /**
   * Test if this collection is empty
   * @return {Boolean} true if empty, false otherwise
   * */
  Collection.prototype.isEmpty = function() {
    return _.isEmpty(this._items);
  };

  /**
   * Return the first item in the collection, null if empty
   * @return {object|undefined} - first item, or undefined if empty
   * */
  Collection.prototype.getFirstItem = function() {
    return this._items[this._order[0]];
  };

  /**
   * Return the last item in the collection, null if empty
   * @return {object|undefined} - last item, or undefined if empty
   * */
  Collection.prototype.getLastItem = function() {
    return this._items[_.last(this._order)];
  };

  /**
   * @return {function|undefined} Returns the type of collection (Array, etc.)
   */
  Collection.prototype.getType = function() {
    return this._type;
  };

  /**
   * @return {string} Returns the name of the collection
   */
  Collection.prototype.getName = function() {
    return this._name;
  };

  /**
   * Join another collection to this one
   * @param {Collection} in_collection Collection to join
   * @return {Collection} Return this collection after it has been joined
   */
  Collection.prototype.joinInPlace = function( in_collection ) {

    if (in_collection.getType() !== this.getType()) {
      throw new Error('Input object type doesn\'t match this collection\'s type');
    }

    return this.bulkAdd( in_collection.items );
  };


  /**
   * Filter out by function
   * @param {function(string, *)} in_filterFunction with arguments key and item
   * @return {Collection} New filtered collection
   */
  Collection.prototype.filter = function( in_filterFunction ) {
    var rtn = new Collection();
    var keeper;

    var filterCb = function( in_key, in_item ) {
      keeper = in_filterFunction( in_key, in_item );
      if (keeper) {
        rtn.add(in_key, in_item);
      }
    };

    this.iterate( filterCb );

    return rtn;
  };

  /**
   * Filter out all keys NOT matching the in_filterKey
   * @param {*|Array} in_filterKey a single key or an array of keys, if the
   * item matches any of the keys it will be filtered in.
   * @return {Collection} New filtered collection with all the items
   * matching at least one key.
   */
  Collection.prototype.filterByKey = function( in_filterKey ) {
    var rtn = new Collection();

    var filterCb;

    if (_.isArray(in_filterKey)) {
      filterCb = function( in_key, in_item ) {
        if (in_filterKey.indexOf(in_key) >= 0) {
          rtn.add(in_key, in_item);
        }
      };
    } else {
      // if in_filterKey is an array
      filterCb = function( in_key, in_item ) {
        if (in_key === in_filterKey) {
          rtn.add(in_key, in_item);
        }
      };
    }

    this.iterate( filterCb );

    return rtn;
  };

  /**
   * Filter out all keys NOT matching the in_filterValue
   * @param {object} in_filterValue Value to filter on
   * @return {Collection} Return a filtered collection
   */
  Collection.prototype.filterByValue = function( in_filterValue ) {
    var rtn = new Collection();

    var filterCb = function( in_key, in_item ) {
      if (in_item === in_filterValue) {
        rtn.add(in_key, in_item);
      }
    };

    this.iterate( filterCb );

    return rtn;
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
   * @param {String|Number} in_key the key we wish to remove
   * @return {Boolean} true if the key exists and was removed, false otherwise.
   */
  Collection.prototype.remove = function( in_key ) {

    if (!this.has(in_key)) {
      return false;
    }

    var remember = this._items[in_key];

    delete this._items[in_key];
    this._order.splice(this._order.indexOf(in_key), 1);

    this.onRemove( in_key, remember);

    return true;
  };

  /**
   * Return the number of items in this Collection
   * @return {Number} the number of items in the collection
   */
  Collection.prototype.getCount = function() {
    return this._order.length;
  };

  /**
   * Returns this collection as an ordered Array
   * @return {Array} Array including the values
   */
  Collection.prototype.getAsArray = function() {

    var rtnArr = new Array( this.getCount() );

    for (var i = 0; i < this._order.length; i++) {
      rtnArr[i] = this._items[this._order[i]];
    }

    return rtnArr;
  };

  /**
   * @param {string|number|CONSTANTS.GUID} in_key the key we are looking for
   * @return {boolean} true if the item exists
   */
  Collection.prototype.has = function(in_key) {
    return this._items.hasOwnProperty(in_key);
  };

  /**
   * Return an item associated with the given key
   * @param {string|number|CONSTANTS.GUID} in_key the key for the item in this
   * Collection
   * @return {*} The item
   */
  Collection.prototype.item = function( in_key ) {
    return this._items[in_key];
  };

  /**
   * Checks if in_value's type is equal to this Collection type. If this collection
   * has no type set, the check will pass.
   *
   * @param {*} in_value A value that is equal to the type managed by this collection.
   * @return {boolean} Return true if the type is a valid type for this
   * collection, throw otherwise.
   * @private
   */
  Collection.prototype._checkType = function( in_value ) {
    if (this._type && !(in_value instanceof this._type)) {
      throw new Error(MSGS.TYPE_MISMATCH);
    } else {
      return true;
    }
  };

  /**
   * Checks if this is a new key in the collection. Throw if already exists.
   * @param {Number|String} in_key The key to check against
   * @return {Boolean} true if key is new
   * @private
   */
  Collection.prototype._checkIsNewKey = function( in_key ) {
    if ( this.has(in_key) ) {
      throw new Error(MSGS.KEY_ALREADY_EXISTS + in_key);
    }

    return true;
  };

  /**
   * Checks if the key exists in the collection. Throw if not.
   * @param {Number|String} in_key the key to check against
   * @return {Boolean} true if key exists
   * @private
   */
  Collection.prototype._checkKeyExists = function( in_key ) {
    if ( !this.has(in_key) ) {
      throw new Error(MSGS.KEY_DOES_NOT_EXIST, in_key);
    }

    return true;
  };

  /**
   * Checks in_key validity. Throw if it's invalid, true otherwise.
   * @param {Number|String} in_key Key to check against
   * @return {Boolean} true if the key is valid
   * @private
   */
  Collection.prototype._checkKey = function( in_key ) {
    if (!_.isNumber(in_key) && !_.isString(in_key)) {
      throw new Error(MSGS.KEY_NOT_VALID);
    }

    return true;
  };

  /**
   * Set an existing key to a value. If key doesn't exist this call will throw
   * an error.
   * @param {String|Number} in_key the key we want to modify
   * @param {*} in_value the value we are to set at this key
   * @return {*} returns the value passed in
   */
  Collection.prototype.set = function( in_key, in_value ) {
    this._checkType( in_value );
    this._checkKey( in_key );
    this._checkKeyExists( in_key );

    this._items[in_key] = in_value;

    return in_value;
  };

  /**
   * Iterate over this collection and run the callback with passing the key and
   * item in the iteration loop.
   * @param {function(in_key, in_item)} in_callback a function that we will call on each item
   * of this collection. If the callback returns false then the iteration will exit early.
   */
  Collection.prototype.iterate = function( in_callback ) {
    var key, continu;
    for (var i = 0; i < this._order.length; i++) {
      key = this._order[i];
      continu = in_callback(key, this._items[key]);
      if (continu === false) {
        break;
      }
    }
  };

  /**
   * Iterate over this collection starting from the tail and run the callback with passing the key and
   * item in the iteration loop.
   * @param {function(in_key, in_item)} in_callback a function that we will call on each item
   * of this collection. If the callback returns false then the iteration will exit early.
   */
  Collection.prototype.iterateFromTail = function( in_callback ) {
    var key, continu;
    for (var i = this._order.length - 1; i >= 0; i--) {
      key = this._order[i];
      continu = in_callback(key, this._items[key]);
      if (continu === false) {
        break;
      }
    }
  };

  /**
   * @return {object} Return an object containing the items of this collection
   */
  Collection.prototype.getItems = function() {
    var result = {};

    _.each(this._items, function(item, key) {
      result[key] = item;
    });

    return result;
  };

  /**
   * Return the list of keys
   * @return {Array} List of keys
   */
  Collection.prototype.getKeys = function() {
    return Object.keys( this._items );
  };

  /**
   * Method used to get the first element in the collection along with its key.
   * @return {object} {item, key}
   */
  Collection.prototype.peak = function() {
    return {
      item: this._items[this._order[0]],
      key: this._order[0]
    };
  };

  /**
   * Clear this collection
   * @return {Collection} this collection
   */
  Collection.prototype.clear = function() {
    if (_.isEmpty(this._items)) {
      return this;
    }

    this.onClear( this._items );

    // Best to just iterate through and remove everything, so that OnRemove
    // handlers are called.

    var that = this;
    _.each(this.getKeys(), function(key) {
      that.remove(key);
    });

    return this;
  };

  /**
   * Copy the items of in_collection to this collection.
   * @param {Collection} in_collection the collection we want to
   * copy from.
   * @return {Collection} new Collection
   */
  Collection.prototype.clone = function() {
    var newCol = new Collection(this._name, this._type);
    newCol.bulkAdd( this._items );
    return newCol;
  };

  /**
   * Copy the items of in_collection to this collection.
   * @param {Collection} in_collection the collection we want to
   * copy from.
   */
  Collection.prototype.copy = function( in_collection ) {
    this.clear();
    var its = in_collection.items;

    var that = this;
    _.each(its, function(item, key) {
      that.add( key, item );
    });
  };

  Object.defineProperty(
    Collection.prototype,
    'values',
    {
      get: function() { return this.getAsArray(); }
    }
  );

  Object.defineProperty(
    Collection.prototype,
    'keys',
    {
      get: function() { return Object.keys( this._items ); }
    }
  );

  module.exports = Collection;
})();
