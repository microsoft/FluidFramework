/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */
/**
 * @fileoverview Collection class definition
 * @module Core
 * @private
 */
import _ from "lodash";

const MSGS = {
    TYPE_MISMATCH: "Type does not match this collection type",
    KEY_ALREADY_EXISTS: "Collection key already exists. ",
    KEY_DOES_NOT_EXIST: "Collection key does not exist in this collection.",
    MUST_GIVE_KEY: "Collection missing key.",
    MUST_GIVE_VALUE: "Collection missing value.",
    KEY_NOT_VALID: "Key must be of type String or Number",
};

export class Collection<T> {
    protected _items: { [key: string]: T } = {};
    protected _order: (string | number)[] = [];

    /**
     * @classdesc Use in_type to make this a typed Collection.
     * @param _name a friendly name to describe this collection. If undefined
     * the collection will have a default "Untitled Collection" assigned to its name.
     * @param _type optional parameter pointing to the constructor
     * of a type this Collection will host.
     * @constructor
     * @private
     * @alias property-common.Datastructures.Collection
     */
    constructor(protected _name = "Untitled Collection", protected _type?: new () => any) {
    }

    // Pass-thru binding handles
    onAdd(in_key, in_value) { }
    onRemove(in_key, in_value) { }
    onClear(in_items) { }

    public get items() {
        return this._items;
    }

    public get keys() {
        return Object.keys(this._items);
    }

    /**
     * @param {Number|String|CONSTANTS.TUID} in_key Key to store the value under
     * @param {object} in_value Value to store in the collection
     * @return {object} Return the value passed in
     */
    add(in_key: number | string, in_value: T): T {
        this._checkIsNewKey(in_key);

        this._items[in_key] = in_value;
        this._order.push(in_key);

        this.onAdd(in_key, in_value);

        return in_value;
    }

    /**
     * Bulk add items.
     * @param {object} in_items List of key-value pairs to be stored in the collection
     * @return {object} this collection after add
     */
    bulkAdd(in_items: { [key: string]: T }) {
        _.each(in_items, (item, key) => {
            this.add(key, item);
        });
        return this;
    }

    /**
     * Bulk remove items.
     * @param in_items List of key-value items to be removed
     * @return this collection after add
     */
    bulkRemove(in_items: { [key: string]: T }) {
        _.each(in_items, (item, key) => {
            this.remove(key);
        });

        return this;
    }

    /**
     * Test if this collection is empty
     * @return {Boolean} true if empty, false otherwise
     * */
    isEmpty() {
        return _.isEmpty(this._items);
    }

    /**
     * Return the first item in the collection, null if empty
     * @return {object|undefined} - first item, or undefined if empty
     * */
    getFirstItem(): T | undefined {
        const index = _.first(this._order);
        return index === undefined ? index : this._items[index];
    }

    /**
     * Return the last item in the collection, null if empty
     * @return - last item, or undefined if empty
     * */
    getLastItem(): T | undefined {
        const index = _.last(this._order);
        return index === undefined ? index : this._items[index];
    }

    /**
     * @return {function|undefined} Returns the type of collection (Array, etc.)
     */
    getType() {
        return this._type;
    }

    /**
     * @return {string} Returns the name of the collection
     */
    getName() {
        return this._name;
    }

    /**
     * Join another collection to this one
     * @param {Collection} in_collection Collection to join
     * @return {Collection} Return this collection after it has been joined
     */
    joinInPlace(in_collection) {
        if (in_collection.getType() !== this.getType()) {
            throw new Error("Input object type doesn't match this collection's type");
        }

        return this.bulkAdd(in_collection.items);
    }

    /**
     * Filter out by function
     * @param {function(string, *)} in_filterFunction with arguments key and item
     * @return {Collection} New filtered collection
     */
    filter(in_filterFunction: (key: string, item: T) => boolean) {
        const rtn = new Collection<T>();

        const filterCb = function(in_key, in_item) {
            const keeper = in_filterFunction(in_key, in_item);
            if (keeper) {
                rtn.add(in_key, in_item);
            }
        };

        this.iterate(filterCb);

        return rtn;
    }

    /**
     * Filter out all keys NOT matching the in_filterKey
     * @param {*|Array} in_filterKey a single key or an array of keys, if the
     * item matches any of the keys it will be filtered in.
     * @return {Collection} New filtered collection with all the items
     * matching at least one key.
     */
    filterByKey(in_filterKey) {
        const rtn = new Collection();

        let filterCb;

        if (_.isArray(in_filterKey)) {
            filterCb = function(in_key, in_item) {
                if (in_filterKey.indexOf(in_key) >= 0) {
                    rtn.add(in_key, in_item);
                }
            };
        } else {
            // if in_filterKey is an array
            filterCb = function(in_key, in_item) {
                if (in_key === in_filterKey) {
                    rtn.add(in_key, in_item);
                }
            };
        }

        this.iterate(filterCb);

        return rtn;
    }

    /**
     * Filter out all keys NOT matching the in_filterValue
     * @param {object} in_filterValue Value to filter on
     * @return {Collection} Return a filtered collection
     */
    filterByValue(in_filterValue) {
        const rtn = new Collection();

        const filterCb = function(in_key, in_item) {
            if (in_item === in_filterValue) {
                rtn.add(in_key, in_item);
            }
        };

        this.iterate(filterCb);

        return rtn;
    }

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
    remove(in_key) {
        if (!this.has(in_key)) {
            return false;
        }

        const remember = this._items[in_key];

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._items[in_key];
        this._order.splice(this._order.indexOf(in_key), 1);

        this.onRemove(in_key, remember);

        return true;
    }

    /**
     * Return the number of items in this Collection
     * @return {Number} the number of items in the collection
     */
    getCount() {
        return this._order.length;
    }

    /**
     * Returns this collection as an ordered Array
     * @return {Array} Array including the values
     */
    getAsArray() {
        const rtnArr: T[] = new Array(this.getCount());

        for (let i = 0; i < this._order.length; i++) {
            rtnArr[i] = this._items[this._order[i]];
        }

        return rtnArr;
    }

    /**
     * @param {string|number|CONSTANTS.GUID} in_key the key we are looking for
     * @return {boolean} true if the item exists
     */
    has(in_key: string | number): boolean {
        return Object.prototype.hasOwnProperty.call(this._items, in_key);
    }

    /**
     * Return an item associated with the given key
     * @param {string|number|CONSTANTS.GUID} in_key the key for the item in this
     * Collection
     * @return {*} The item
     */
    item(in_key) {
        return this._items[in_key];
    }

    /**
     * Checks if this is a new key in the collection. Throw if already exists.
     * @param {Number|String} in_key The key to check against
     * @return {Boolean} true if key is new
     * @private
     */
    _checkIsNewKey(in_key) {
        if (this.has(in_key)) {
            throw new Error(`${MSGS.KEY_ALREADY_EXISTS} ${in_key}`);
        }

        return true;
    }

    /**
     * Checks if the key exists in the collection. Throw if not.
     * @param {Number|String} in_key the key to check against
     * @return {Boolean} true if key exists
     * @private
     */
    _checkKeyExists(in_key) {
        if (!this.has(in_key)) {
            throw new Error(`${MSGS.KEY_DOES_NOT_EXIST} ${in_key}`);
        }

        return true;
    }

    /**
     * Set an existing key to a value. If key doesn't exist this call will throw
     * an error.
     * @param in_key the key we want to modify
     * @param  in_value the value we are to set at this key
     * @return {*} returns the value passed in
     */
    set(in_key: string, in_value: T) {
        this._checkKeyExists(in_key);

        this._items[in_key] = in_value;

        return in_value;
    }

    /**
     * Iterate over this collection and run the callback with passing the key and
     * item in the iteration loop.
     * @param {function(in_key, in_item)} in_callback a function that we will call on each item
     * of this collection. If the callback returns false then the iteration will exit early.
     */
    iterate(in_callback) {
        for (const key of this._order) {
            const continu = in_callback(key, this._items[key]);
            if (continu === false) {
                break;
            }
        }
    }

    /**
     * Iterate over this collection starting from the tail and run the callback with passing the key and
     * item in the iteration loop.
     * @param {function(in_key, in_item)} in_callback a function that we will call on each item
     * of this collection. If the callback returns false then the iteration will exit early.
     */
    iterateFromTail(in_callback) {
        let key; let continu;
        for (let i = this._order.length - 1; i >= 0; i--) {
            key = this._order[i];
            continu = in_callback(key, this._items[key]);
            if (continu === false) {
                break;
            }
        }
    }

    /**
     * @return {object} Return an object containing the items of this collection
     */
    getItems() {
        const result = {};

        _.each(this._items, function(item, key) {
            result[key] = item;
        });

        return result;
    }

    /**
     * Return the list of keys
     * @return {Array} List of keys
     */
    getKeys() {
        return Object.keys(this._items);
    }

    /**
     * Method used to get the first element in the collection along with its key.
     * @return {object} {item, key}
     */
    peak() {
        return {
            item: this._items[this._order[0]],
            key: this._order[0],
        };
    }

    /**
     * Clear this collection
     * @return {Collection} this collection
     */
    clear() {
        if (_.isEmpty(this._items)) {
            return this;
        }

        this.onClear(this._items);

        // Best to just iterate through and remove everything, so that OnRemove
        // handlers are called.

        _.each(this.getKeys(), (key) => {
            this.remove(key);
        });

        return this;
    }

    /**
     * Copy the items of in_collection to this collection.
     * @param {Collection} in_collection the collection we want to
     * copy from.
     * @return {Collection} new Collection
     */
    clone() {
        const newCol = new Collection(this._name, this._type);
        newCol.bulkAdd(this._items);
        return newCol;
    }

    /**
     * Copy the items of in_collection to this collection.
     * @param {Collection} in_collection the collection we want to
     * copy from.
     */
    copy(in_collection) {
        this.clear();
        const its = in_collection.items;

        _.each(its, (item, key) => {
            this.add(key, item);
        });
    }

    get values() {
        return this.getAsArray();
    }
}
