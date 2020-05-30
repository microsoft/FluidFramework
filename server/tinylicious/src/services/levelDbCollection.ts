/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "@fluidframework/server-services-core";
import * as charwise from "charwise";
import * as _ from "lodash";

export interface ICollectionProperty {
    indexes: string[]; // Index structure for the collecion.
    limit?: number;  // Range query maximum fetch. If set, last index should be a number.
}

export class Collection<T> implements ICollection<T> {
    constructor(private readonly db: any,
        private readonly property: ICollectionProperty) {
    }

    public async find(query: any, sort?: any): Promise<T[]> {
        return this.findInternal(query, sort);
    }

    public async findAll(): Promise<T[]> {
        throw new Error("Method not implemented.");
    }

    public findOne(query: any): Promise<T> {
        return this.findOneInternal(query);
    }

    public async update(filter: any, set: any, addToSet: any): Promise<void> {
        const value = await this.findOneInternal(filter);
        if (!value) {
            return Promise.reject("Not found");
        } else {
            _.extend(value, set);
            return this.insertOne(value);
        }
    }

    public async upsert(filter: any, set: any, addToSet: any): Promise<void> {
        const value = await this.findOneInternal(filter);
        if (!value) {
            return this.insertOne(set);
        } else {
            _.extend(value, set);
            return this.insertOne(value);
        }
    }

    public async insertOne(value: any): Promise<any> {
        return this.insertOneInternal(value);
    }

    public async findOrCreate(query: any, value: any): Promise<{ value: any, existing: boolean }> {
        const existing = await this.findOneInternal(query);
        if (existing) {
            return { value: existing, existing: true };
        } else {
            const item = await this.insertOneInternal(value);
            return { value: item, existing: false };
        }
    }

    public async insertMany(values: any[], ordered: boolean): Promise<void> {
        const batchValues = [];
        values.forEach((value) => {
            batchValues.push({
                type: "put",
                key: this.getKey(value),
                value,
            });
        });
        return this.db.batch(batchValues);
    }

    public async deleteOne(filter: any): Promise<any> {
        return this.db.del(this.getKey(filter));
    }

    // We should probably implement this.
    public async deleteMany(filter: any): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        return;
    }

    private async insertOneInternal(value: any): Promise<any> {
        await this.db.put(this.getKey(value), value);
        return value;
    }

    private async findOneInternal(query: any): Promise<T> {
        const values = await this.findInternal(query);
        return values.length > 0 ? values[0] : null;
    }

    // Generate an insertion key for a value based on index structure.
    private getKey(value: any) {
        function getValueByKey(propertyBag, key: string) {
            const keys = key.split(".");
            let v = propertyBag;
            keys.forEach((splitKey) => {
                v = v[splitKey];
            });
            return v;
        }

        const values = [];
        this.property.indexes.forEach((key) => {
            const innerValue = getValueByKey(value, key);
            // Leveldb does lexicographic comparison. We need to encode a number for numeric comparison.
            values.push(isNaN(innerValue) ? innerValue : charwise.encode(Number(innerValue)));
        });

        return values.join("!");
    }

    private async findInternal(query: any, sort?: any): Promise<T[]> {
        const isRange = this.property.limit !== undefined;
        const indexes = this.property.indexes;
        const indexLen = isRange ? indexes.length - 1 : indexes.length;
        const queryValues = [];
        for (let i = 0; i < indexLen; ++i) {
            if (query[indexes[i]] !== undefined) {
                queryValues.push(query[indexes[i]]);
            }
        }
        const key = queryValues.join("!");
        if (isRange) {
            const rangeKey = indexes[indexes.length - 1];
            const from = query[rangeKey] && query[rangeKey].$gt > 0 ?
                Number(query[rangeKey].$gt) + 1 :
                1;
            const to = query[rangeKey] && query[rangeKey].$lt > 0 ?
                Number(query[rangeKey].$lt) - 1 :
                from + this.property.limit - 1;

            const gte = `${key}!${charwise.encode(Number(from))}`;
            const lte = `${key}!${charwise.encode(Number(to))}`;
            const valueStream = this.db.createValueStream({
                gte,
                lte,
                limit: this.property.limit,
            });

            const entries: T[] = [];

            return new Promise<T[]>((resolve, reject) => {
                valueStream.on("data", (data: T) => {
                    entries.push(data);
                });
                valueStream.on("end", () => {
                    resolve(entries);
                });
                valueStream.on("error", (error) => {
                    reject(error);
                });
            });
        } else {
            return new Promise<T[]>((resolve, reject) => {
                this.db.get(key, (err, val) => {
                    if (err) {
                        if (err.notFound) {
                            resolve([]);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve([val]);
                    }
                });
            });
        }
    }
}
