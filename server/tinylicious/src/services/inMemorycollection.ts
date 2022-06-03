/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "@fluidframework/server-services-core";
import * as _ from "lodash";

// TODO consider https://github.com/kofrasa/mingo for handling queries

export class Collection<T> implements ICollection<T> {
    private readonly collection = new Array<T>();

    constructor() {
    }

    public aggregate(pipeline: any, options?: any): any {
        throw new Error("Method Not Implemented");
    }

    public async updateMany(filter: any, set: any, addToSet: any): Promise<void> {
        throw new Error("Method Not Implemented");
    }
    public async distinct(key: any, query: any): Promise<any> {
        throw new Error("Method Not Implemented");
    }

    public async find(query: any, sort?: any): Promise<T[]> {
        return this.findInternal(query, sort);
    }

    public async findAll(): Promise<T[]> {
        return this.collection;
    }

    public findOne(query: any): Promise<T> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Promise.resolve(this.findOneInternal(query));
    }

    public async update(filter: any, set: any, addToSet: any): Promise<void> {
        const value = this.findOneInternal(filter);
        if (!value) {
            return Promise.reject(new Error("Not found"));
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.insertOneInternal(value);
    }

    public async findOrCreate(query: any, value: any): Promise<{ value: any; existing: boolean; }> {
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

    public async createIndex(index: any, unique: boolean): Promise<void> {
        return;
    }

    private insertOneInternal(value: any): any {
        this.collection.push(value);
        return value;
    }

    private findOneInternal(query: any): any {
        let returnValue: any;
        if (query._id) {
            returnValue = this.collection.find((value) => (value as any)._id === query._id);
        } else {
            const found = this.findInternal(query);
            returnValue = found[0];
        }
        return returnValue === undefined ? null : returnValue;
    }

    private findInternal(query: any, sort?: any): T[] {
        function getValueByKey(propertyBag, key: string) {
            const keys = key.split(".");
            let value = propertyBag;
            keys.forEach((splitKey) => {
                value = value[splitKey];
            });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return value;
        }

        const queryKeys = Object.keys(query);
        let filteredCollection = this.collection;
        queryKeys.forEach((key) => {
            if (!query[key]) {
                return;
            }
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
}
