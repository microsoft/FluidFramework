/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDb, IDbFactory } from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import * as _ from "lodash";

export class TestCollection implements ICollection<any> {
    constructor(public collection: any[]) {
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
        let filteredCollection = this.collection;
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
                    // a goes before b, sorting in ascending order
                    return getValueByKey(a, sortKey) - getValueByKey(b, sortKey);
                } else {
                    // b goes before a, sorting in descending order
                    return getValueByKey(b, sortKey) - getValueByKey(a, sortKey);
                }
            }

            filteredCollection = filteredCollection.sort(compare);
        }
        return filteredCollection;
    }

    public async findAll(): Promise<any[]> {
        return this.collection;
    }

    public findOne(query: any): Promise<any> {
        return Promise.resolve(this.findOneInternal(query));
    }

    public async update(filter: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(filter);
        if (!value) {
            return Promise.reject("Not found");
        }
        _.extend(value, set);
    }

    public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(filter);
        if (!value) {
            this.collection.push(set);
        }

        _.extend(value, set);
    }

    public async insertOne(value: any): Promise<any> {
        if (this.findOneInternal(value) !== null) {
            return Promise.resolve("existing object");
        }

        return this.insertOneInternal(value);
    }

    public async findOrCreate(query: any, value: any): Promise<{ value: any; existing: boolean }> {
        const existing = this.findOneInternal(query);
        if (existing) {
            return { value: existing, existing: true };
        }

        return { value: this.insertOneInternal(value), existing: false };
    }

    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        values.forEach((value) => {
            this.collection.push(value);
        });
    }

    public async deleteOne(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async deleteMany(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public createIndex(index: any, unique: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    private insertOneInternal(value: any): any {
        this.collection.push(value);
        return value;
    }

    private findOneInternal(query: any): any {
        const returnValue = this.collection.find((value) => value._id === query._id);
        return returnValue === undefined ? null : returnValue;
    }
}

export class TestDb implements IDb {
    private emitter = new EventEmitter();

    constructor(private collections: { [key: string]: any[] }) {
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.emitter.on(event, listener);
    }

    public collection<T>(name: string): ICollection<T> {
        if (!(name in this.collections)) {
            this.collections[name] = [];
        }

        const collection = this.collections[name];
        return new TestCollection(collection);
    }
}

export interface ITestDbFactory extends IDbFactory {
    readonly testDatabase: IDb;
}

export class TestDbFactory implements ITestDbFactory {
    public readonly testDatabase: IDb;
    constructor(collections: { [key: string]: any[] }) {
        this.testDatabase = new TestDb(collections);
    }

    public connect(): Promise<IDb> {
        return Promise.resolve(this.testDatabase);
    }
}
