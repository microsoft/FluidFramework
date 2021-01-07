/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";
import { Collection, MongoClient, MongoClientOptions } from "mongodb";

const MaxFetchSize = 2000;

export class MongoCollection<T> implements core.ICollection<T> {
    constructor(private readonly collection: Collection<T>) {
    }

    // eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
    public find(query: object, sort: any, limit = MaxFetchSize): Promise<T[]> {
        return this.collection
            .find(query)
            .sort(sort)
            .limit(limit)
            .toArray();
    }

    // eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
    public findOne(query: object): Promise<T> {
        return this.collection.findOne(query);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public findAll(): Promise<T[]> {
        return this.collection.find({}).toArray();
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async update(filter: object, set: any, addToSet: any): Promise<void> {
        return this.updateCore(filter, set, addToSet, false);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async upsert(filter: object, set: any, addToSet: any): Promise<void> {
        return this.updateCore(filter, set, addToSet, true);
    }

    public async deleteOne(filter: any): Promise<any> {
        return this.collection.deleteOne(filter);
    }

    public async deleteMany(filter: any): Promise<any> {
        return this.collection.deleteMany(filter);
    }

    public async insertOne(value: T): Promise<any> {
        const result = await this.collection.insertOne(value);
        return result.insertedId;
    }

    public async insertMany(values: T[], ordered: boolean): Promise<void> {
        await this.collection.insertMany(values, { ordered: false });
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        await this.collection.createIndex(index, { unique });
    }

    public async createTTLIndex(index: any, expireAfterSeconds?: number): Promise<void> {
        await this.collection.createIndex(index, { expireAfterSeconds });
    }

    public async findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }> {
        const result = await this.collection.findOneAndUpdate(
            query,
            {
                $setOnInsert: value,
            },
            {
                returnOriginal: true,
                upsert: true,
            });

        if (result.value) {
            return { value: result.value, existing: true };
        } else {
            return { value, existing: false };
        }
    }

    private async updateCore(filter: any, set: any, addToSet: any, upsert: boolean): Promise<void> {
        const update: any = {};
        if (set) {
            update.$set = set;
        }

        if (addToSet) {
            update.$addToSet = addToSet;
        }

        const options = { upsert };

        await this.collection.updateOne(filter, update, options);
    }
}

export class MongoDb implements core.IDb {
    constructor(private readonly client: MongoClient) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        return this.client.close();
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.client.on(event, listener);
    }

    public collection<T>(name: string): core.ICollection<T> {
        const collection = this.client.db("admin").collection<T>(name);
        return new MongoCollection<T>(collection);
    }
}

export class MongoDbFactory implements core.IDbFactory {
    constructor(private readonly endpoint: string) {
    }

    public async connect(): Promise<core.IDb> {
        // Need to cast to any before MongoClientOptions due to missing properties in d.ts
        const options: MongoClientOptions = {
            autoReconnect: false,
            bufferMaxEntries: 0,
            useNewUrlParser: true,
        };

        const connection = await MongoClient.connect(this.endpoint, options);

        return new MongoDb(connection);
    }
}
