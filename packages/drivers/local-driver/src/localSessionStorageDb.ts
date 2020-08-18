/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { ITestDbFactory } from "@fluidframework/server-test-utils";
import uuid from "uuid";

/**
 * A collection for local session storage databese
 * Functions include database operations such as queries, insertion and update.
 */
class LocalSessionStorageCollection<T> implements ICollection<T> {
    private readonly collectionName: string;
    constructor(namespace, name) {
        this.collectionName = `${namespace}-${name}`;
    }

    /**
     *
     * @param query - data we want to find
     * @param sort - the value used to sort data. e.g. operation.sequenceNumber
     *
     */
    public async find(query: any, sort: any): Promise<any[]> {
        // split the keys and get the corresponding value
        function getValueByKey(propertyBag, key: string) {
            const keys = key.split(".");
            let value = propertyBag;
            keys.forEach((splitKey) => {
                value = value[splitKey];
            });
            return value;
        }

        // getting keys of the query we are trying to find
        const queryKeys = Object.keys(query);
        let filteredCollection = this.getAllInternal();
        queryKeys.forEach((key) => {
            if (query[key].$gt > 0 || query[key].$lt > 0) {
                if (query[key].$gt > 0) {
                    filteredCollection = filteredCollection.filter(
                        (value) => getValueByKey(value, key) > query[key].$gt);
                }
                if (query[key].$lt > 0) {
                    filteredCollection = filteredCollection.filter(
                        (value) => getValueByKey(value, key) < query[key].$lt);
                }
            } else {
                filteredCollection = filteredCollection.filter(
                    (value) => getValueByKey(value, key) === query[key]);
            }
        });

        if (sort && Object.keys(sort).length === 1) {
            // eslint-disable-next-line no-inner-declarations
            function compare(a, b) {
                const sortKey = Object.keys(sort)[0];
                if (sort[sortKey] === 1) {
                    // A goes before b, sorting in ascending order
                    return getValueByKey(a, sortKey) - getValueByKey(b, sortKey);
                } else {
                    // B goes before a, sorting in descending order
                    return getValueByKey(b, sortKey) - getValueByKey(a, sortKey);
                }
            }

            filteredCollection = filteredCollection.sort(compare);
        }

        return filteredCollection;
    }

    /**
     * Find all values in the database, returns a promise
     *
     * No need to use Promise.resolve() since a promise is returned automatically
     */
    public async findAll(): Promise<any[]> {
        return Promise.resolve(this.getAllInternal());
    }

    /**
     * Find the query in the database, returns a promise
     *
     *  @param query - data we want to find
     *
     * No need to use Promise.resolve() since a promise is returned automatically
     */
    public async findOne(query: any): Promise<any> {
        return Promise.resolve(this.findOneInternal(query));
    }

    /**
     * Update value in the database
     *
     * First find the query in the db. If it exists, update the value to given set and insert
     * Otherwise throw error.
     *
     *  @param query - data we want to find
     *  @param set - new values to change to
     *  @param addToSet - TBD
     */
    public async update(query: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(query);
        if (!value) {
            throw new Error("Not found");
        } else {
            for (const key of Object.keys(set)) {
                value[key] = set[key];
            }
            this.insertInternal(value);
        }
    }

    /**
     * Inserting a set to the value that satisfies given query
     *
     * First find the value that satisfies query. If it doesn't exist, insert the set.
     * Otherwise update the value to be the given set.Then insert updated value to the database.
     * Upsert means update and insert
     *
     *  @param query - data we want to find
     *  @param set - new values to change to
     *  @param addToSet - TBD
     */
    public async upsert(query: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(query);
        if (!value) {
            this.insertInternal(set);
        } else {
            for (const key of Object.keys(set)) {
                value[key] = set[key];
            }
            this.insertInternal(value);
        }
    }

    /**
     * Inset one value into the database
     *
     * First find if value already exist. If so, check if the values are equal.
     * Otherwise insert into the database.
     *
     *  @param value - data to insert to the database
     *
     */
    public async insertOne(value: any): Promise<any> {
        const presentVal = this.findOneInternal(value);
        // Only raise error when the object is present and the value is not equal.
        if (presentVal) {
            if (JSON.stringify(presentVal) === JSON.stringify(value)) {
                return;
            }
            throw new Error("Existing Object!!");
        }

        return this.insertInternal(value);
    }

    /**
     * Find query or insert if value didn't exist
     *
     * First check if query exists in the database
     * If it exists, return the value and show that it exists
     * Otherwise, insert the value to the databse and return it, showing that it did not exist.
     *
     * @param query - data we want to find
     * @param value - data to insert to the database if we cannot find query
     */
    public async findOrCreate(query: any, value: any): Promise<{ value: any, existing: boolean }> {
        const existing = this.findOneInternal(query);
        if (existing) {
            return { value: existing, existing: true };
        }
        this.insertInternal(value);
        return { value, existing: false };
    }

    /**
     * Insert multiple values in the database, can be either ordered or not
     *
     * @param values - data to insert to the database
     * @param ordered - if data is sorted
     */
    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        this.insertInternal(...values);
    }

    /**
     * Delete one value that satisfy the query
     * Not yet implemented
     */
    public async deleteOne(query: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    /**
     * Delete values that satisfy the query.
     * Not yet implemented
     */
    public async deleteMany(query: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    /**
     * Create an index
     * Not yet implemented
     */
    public async createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    /**
     * Return all values in db
     */
    private getAllInternal(): any[] {
        const values: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (key!.startsWith(this.collectionName)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                values.push(JSON.parse(sessionStorage.getItem(key!)!));
            }
        }
        return values;
    }

    /**
     * Assign unique id to each value and insert into the db
     *
     * @param values - data to insert to the database
     *
     */
    private insertInternal(...values: any[]) {
        for (const value of values) {
            if (value) {
                if (!value._id) {
                    value._id = uuid();// get unique id
                }
                sessionStorage.setItem(`${this.collectionName}-${value._id}`, JSON.stringify(value));
            }
        }
    }

    /**
     * Find the query in the db
     *
     * If the query has an id, we get the json object nd return.
     * Otherwise we get the keys of the query and go through the db to
     * compare the values until we find the same one with query and return.
     * The second part is not so efficient time-wise. Optimization is needed in the future.
     *
     * @param query - what to find in the database
     *
    */
    private findOneInternal(query: any): any {
        if (query._id) {
            const json = sessionStorage.getItem(`${this.collectionName}-${query._id}`);// form of data
            if (json) {
                return JSON.parse(json);
            }
        } else {
            const queryKeys = Object.keys(query);
            for (let i = 0; i < sessionStorage.length; i++) {
                const ssKey = sessionStorage.key(i);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (!ssKey!.startsWith(this.collectionName)) {
                    continue;
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const value = JSON.parse(sessionStorage.getItem(ssKey!)!);
                for (const qk of queryKeys) {
                    if (value[qk] !== query[qk]) {
                        continue;
                    }
                }
                return value;
            }
        }
        // eslint-disable-next-line no-null/no-null
        return null;
    }
}

/**
 * A database for testing that stores data in the browsers session storage
 */
class LocalSessionStorageDb extends EventEmitter implements IDb {
    private readonly collections = new Map<string, LocalSessionStorageCollection<any>>();
    constructor(private readonly namespace) {
        super();
    }
    public async close(): Promise<void> {
        return Promise.resolve();
    }
    public collection<T>(name: string): ICollection<T> {
        if (!this.collections.has(name)) {
            this.collections.set(name, new LocalSessionStorageCollection<T>(`${this.namespace}-db`, name));
        }
        return this.collections.get(name) as LocalSessionStorageCollection<T>;
    }
}

/**
 * A database factory for testing that stores data in the browsers session storage
 */
export class LocalSessionStorageDbFactory implements ITestDbFactory {
    public readonly testDatabase: IDb;
    constructor(namespace: string) {
        this.testDatabase = new LocalSessionStorageDb(namespace);
    }
    public async connect(): Promise<IDb> {
        return Promise.resolve(this.testDatabase);
    }
}
