/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { ITestDbFactory } from "@fluidframework/server-test-utils";
import uuid from "uuid";

/**
 * A collection for testing that stores data in the browsers session storage
 */
class LocalSessionStorageCollection<T> implements ICollection<T> {
    private readonly collectionName: string;
    constructor(namespace, name) {
        this.collectionName = `${namespace}-${name}`;
    }

    public async find(query: any, sort: any): Promise<any[]> {
        function getValueByKey(propertyBag, key: string) {
            const keys = key.split(".");
            let value = propertyBag;
            keys.forEach((splitKey) => {
                value = value[splitKey];
            });
            return value;
        }

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

    public async findAll(): Promise<any[]> {
        return Promise.resolve(this.getAllInternal());
    }

    public async findOne(query: any): Promise<any> {
        return Promise.resolve(this.findOneInternal(query));
    }

    public async update(filter: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(filter);
        if (!value) {
            throw new Error("Not found");
        } else {
            for (const key of Object.keys(set)) {
                value[key] = set[key];
            }
            this.insertInternal(value);
        }
    }

    public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(filter);
        if (!value) {
            this.insertInternal(set);
        } else {
            for (const key of Object.keys(set)) {
                value[key] = set[key];
            }
            this.insertInternal(value);
        }
    }

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

    public async findOrCreate(query: any, value: any): Promise<{ value: any, existing: boolean }> {
        const existing = this.findOneInternal(query);
        if (existing) {
            return { value: existing, existing: true };
        }
        this.insertInternal(value);
        return { value, existing: false };
    }

    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        this.insertInternal(...values);
    }

    public async deleteOne(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async deleteMany(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

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

    private insertInternal(...values: any[]) {
        for (const value of values) {
            if (value) {
                if (!value._id) {
                    value._id = uuid();
                }
                sessionStorage.setItem(`${this.collectionName}-${value._id}`, JSON.stringify(value));
            }
        }
    }

    private findOneInternal(query: any): any {
        if (query._id) {
            const json = sessionStorage.getItem(`${this.collectionName}-${query._id}`);
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
