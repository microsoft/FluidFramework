/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { ICollection, IDb } from "@microsoft/fluid-server-services-core";
import { ITestDbFactory } from "@microsoft/fluid-server-test-utils";
import * as uuid from "uuid";

/**
 * A database factory for testing that store data in the browsers session storage
 */
export class SessionStorageDbFactory implements ITestDbFactory {
    public readonly testDatabase: IDb;
    constructor(namespace: string) {
        this.testDatabase = new SessionStorageDb(namespace);
    }
    public async connect(): Promise<IDb> {
        return Promise.resolve(this.testDatabase);
    }

}

/**
 * A database for testing that store data in the browsers session storage
 */
class SessionStorageDb extends EventEmitter implements IDb {
    private readonly collections = new Map<string, SessionStorageCollection<any>>();
    constructor(private readonly namespace) {
        super();
    }
    public async close(): Promise<void> {
        return Promise.resolve();
    }
    public collection<T>(name: string): ICollection<T> {
        if (!this.collections.has(name)) {
            this.collections.set(name, new SessionStorageCollection<T>(`${this.namespace}-db`, name));
        }
        return this.collections.get(name) as SessionStorageCollection<T>;
    }
}

/**
 * A collection for testing that store data in the browsers session storage
 */
class SessionStorageCollection<T> implements ICollection<T> {
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
        if (this.findOneInternal(value)) {
            throw new Error("existing object");
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
        const values = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key.startsWith(this.collectionName)) {
                values.push(JSON.parse(sessionStorage.getItem(key)));
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
                if (!ssKey.startsWith(this.collectionName)) {
                    continue;
                }
                const value = JSON.parse(sessionStorage.getItem(ssKey));
                for (const qk of queryKeys) {
                    if (value[qk] !== query[qk]) {
                        continue;
                    }
                }
                return value;
            }
        }
        return null;
    }
}
