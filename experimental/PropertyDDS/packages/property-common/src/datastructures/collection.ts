/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */
/**
 * @fileoverview Collection class definition
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
    protected _items: { [key: string]: T; } = {};
    protected _order: (string | number)[] = [];

    /**
     * @param _name - a friendly name to describe this collection. If undefined
     * the collection will have a default "Untitled Collection" assigned to its name.
     * @param _type - optional parameter pointing to the constructor
     * of a type this Collection will host.
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
     * @param in_key - Key to store the value under
     * @param in_value - Value to store in the collection
     * @returns Return the value passed in
     */
    add(in_key: number | string, in_value: T): T {
        this._checkType(in_value);
        this._checkIsNewKey(in_key);

        this._items[in_key] = in_value;
        this._order.push(in_key);

        this.onAdd(in_key, in_value);

        return in_value;
    }

    /**
     * Checks if in_value's type is equal to this Collection type. If this collection
     * has no type set, the check will pass.
     *
     * @param in_value - A value that is equal to the type managed by this collection.
     * @returns Return true if the type is a valid type for this
     * collection, throw otherwise.
     */
    private _checkType(in_value: T) {
        if (this._type && !(in_value instanceof this._type)) {
            throw new Error(MSGS.TYPE_MISMATCH);
        } else {
            return true;
        }
    }

    /**
     * Bulk add items.
     * @param in_items - List of key-value pairs to be stored in the collection
     * @returns this collection after add
     */
    bulkAdd(in_items: { [key: string]: T; }) {
        _.each(in_items, (item, key) => {
            this.add(key, item);
        });
        return this;
    }

    /**
     * Bulk remove items.
     * @param in_items - List of key-value items to be removed
     * @returns this collection after add
     */
    bulkRemove(in_items: { [key: string]: T; }) {
        _.each(in_items, (item, key) => {
            this.remove(key);
        });

        return this;
    }

    /**
     * Test if this collection is empty
     * @returns true if empty, false otherwise
     * */
    isEmpty() {
        return _.isEmpty(this._items);
    }

    /**
     * Return the first item in the collection, null if empty
     * @returns first item, or undefined if empty
     * */
    getFirstItem(): T | undefined {
        const index = _.first(this._order);
        return index === undefined ? index : this._items[index];
    }

    /**
     * Return the last item in the collection, null if empty
     * @returns - last item, or undefined if empty
     * */
    getLastItem(): T | undefined {
        const index = _.last(this._order);
        return index === undefined ? index : this._items[index];
    }

    /**
     * @returns Returns the type of collection (Array, etc.)
     */
    getType() {
        return this._type;
    }

    /**
     * @returns Returns the name of the collection
     */
    getName(): string {
        return this._name;
    }

    /**
     * Filter out by function
     * @param in_filterFunction - with arguments key and item
     * @returns A new filtered collection
     */
    filter(in_filterFunction: (key: string, item: T) => boolean): Collection<T> {
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
     * @param in_filterKey - a single key or an array of keys, if the
     * item matches any of the keys it will be filtered in.
     * @returns New filtered collection with all the items
     * matching at least one key.
     */
    filterByKey(in_filterKey: string | string[]): Collection<T> {
        const rtn = new Collection<T>();

        const filterCb = _.isArray(in_filterKey)
            ? function(in_key, in_item) {
                if (in_filterKey.includes(in_key)) {
                    rtn.add(in_key, in_item);
                }
            } : function(in_key, in_item) {
                if (in_key === in_filterKey) {
                    rtn.add(in_key, in_item);
                }
            };

        this.iterate(filterCb);

        return rtn;
    }

    /**
     * Filter out all keys NOT matching the in_filterValue
     * @param in_filterValue - Value to filter on
     * @returns Return a filtered collection
     */
    filterByValue(in_filterValue: T): Collection<T> {
        const rtn = new Collection<T>();

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
     * @param in_key - the key we wish to remove
     * @returns true if the key exists and was removed, false otherwise.
     */
    remove(in_key: number | string): boolean {
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
     * @returns the number of items in the collection
     */
    getCount(): number {
        return this._order.length;
    }

    /**
     * Returns this collection as an ordered Array
     * @returns Array including the values
     */
    getAsArray() {
        const rtnArr: T[] = new Array(this.getCount());

        for (let i = 0; i < this._order.length; i++) {
            rtnArr[i] = this._items[this._order[i]];
        }

        return rtnArr;
    }

    /**
     * @param in_key - the key we are looking for
     * @returns true if the item exists
     */
    has(in_key: string | number): boolean {
        return Object.prototype.hasOwnProperty.call(this._items, in_key);
    }

    /**
     * Return an item associated with the given key
     * @param in_key - the key for the item in this
     * Collection
     * @returns The item
     */
    item(in_key: number | string) {
        return this._items[in_key];
    }

    /**
     * Checks if this is a new key in the collection. Throw if already exists.
     * @param in_key - The key to check against
     * @returns true if key is new
     */
    private _checkIsNewKey(in_key: number | string) {
        if (this.has(in_key)) {
            throw new Error(`${MSGS.KEY_ALREADY_EXISTS} ${in_key}`);
        }

        return true;
    }

    /**
     * Checks if the key exists in the collection. Throw if not.
     * @param in_key - the key to check against
     * @returns true if key exists
     */
    private _checkKeyExists(in_key: number | string) {
        if (!this.has(in_key)) {
            throw new Error(`${MSGS.KEY_DOES_NOT_EXIST} ${in_key}`);
        }

        return true;
    }

    /**
     * Set an existing key to a value. If key doesn't exist this call will throw
     * an error.
     * @param in_key - The key we want to modify
     * @param in_value - The value we are to set at this key
     * @returns The value passed in
     */
    set(in_key: string, in_value: T) {
        this._checkKeyExists(in_key);

        this._items[in_key] = in_value;

        return in_value;
    }

    /**
     * Iterate over this collection and run the callback with passing the key and
     * item in the iteration loop.
     * @param in_callback - A function that we will call on each item
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
     * @param in_callback - a function that we will call on each item
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
     * @returns Return an object containing the items of this collection
     */
    getItems(): { [key: string]: T; } {
        const result = {};

        _.each(this._items, function(item, key) {
            result[key] = item;
        });

        return result;
    }

    /**
     * Return the list of keys
     * @returns List of keys
     */
    getKeys(): string[] {
        return Object.keys(this._items);
    }

    /**
     * Method used to get the first element in the collection along with its key.
     */
    peak() {
        return {
            item: this._items[this._order[0]],
            key: this._order[0],
        };
    }

    /**
     * Clear this collection
     * @returns this collection
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
     * @param in_collection - the collection we want to
     * copy from.
     * @returns new Collection
     */
    clone(): Collection<T> {
        const newCol = new Collection<T>(this._name, this._type);
        newCol.bulkAdd(this._items);
        return newCol;
    }

    /**
     * Copy the items of in_collection to this collection.
     * @param in_collection - the collection we want to
     * copy from.
     */
    copy(in_collection: Collection<T>) {
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
