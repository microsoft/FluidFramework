/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "console";
import * as core from "@fluidframework/server-services-core";
import { AggregationCursor, Collection, MongoClient, MongoClientOptions } from "mongodb";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

const MaxFetchSize = 2000;

export class MongoCollection<T> implements core.ICollection<T> {
    constructor(private readonly collection: Collection<T>) {
    }

    public aggregate(group: any, options?: any): AggregationCursor<T> {
        Lumberjack.info(`mongodb-aggregate on ${this.collection} set ${JSON.stringify(group)}`);
        const pipeline: any = [];
        pipeline.$group = group;
        return this.collection.aggregate(pipeline, options);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
    public find(query: object, sort: any, limit = MaxFetchSize): Promise<T[]> {
        Lumberjack.info(`mongodb-find on ${this.collection} set ${JSON.stringify(query)}`);
        return this.collection
            .find(query)
            .sort(sort)
            .limit(limit)
            .toArray();
    }

    // eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
    public findOne(query: object): Promise<T> {
        Lumberjack.info(`mongodb-findOne on ${this.collection} set ${JSON.stringify(query)}`);
        return this.collection.findOne(query);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public findAll(): Promise<T[]> {
        Lumberjack.info(`mongodb-findAll on ${this.collection} set n/a`);
        return this.collection.find({}).toArray();
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async update(filter: object, set: any, addToSet: any): Promise<void> {
        Lumberjack.info(`mongodb-update on ${this.collection} set ${JSON.stringify(set)}`);
        return this.updateCore(filter, set, addToSet, false);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async updateMany(filter: object, set: any, addToSet: any): Promise<void> {
        Lumberjack.info(`mongodb-updateMany on ${this.collection} set ${JSON.stringify(set)}`);
        return this.updateManyCore(filter, set, addToSet, false);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async upsert(filter: object, set: any, addToSet: any): Promise<void> {
        Lumberjack.info(`mongodb-upsert on ${this.collection} set ${JSON.stringify(set)}`);
        return this.updateCore(filter, set, addToSet, true);
    }

    public async distinct(key: any, query: any): Promise<any> {
        Lumberjack.info(`mongodb-distinct on ${this.collection} set ${JSON.stringify(query)}`);
        return this.collection.distinct(key, query);
    }

    public async deleteOne(filter: any): Promise<any> {
        Lumberjack.info(`mongodb-deleteOne on ${this.collection} set ${JSON.stringify(filter)}`);
        return this.collection.deleteOne(filter);
    }

    public async deleteMany(filter: any): Promise<any> {
        Lumberjack.info(`mongodb-deleteMany on ${this.collection} set ${JSON.stringify(filter)}`);
        return this.collection.deleteMany(filter);
    }

    public async insertOne(value: T): Promise<any> {
        Lumberjack.info(`mongodb-insertOne on ${this.collection} set ${JSON.stringify(value)}`);
        const result = await this.collection.insertOne(value);
        return result.insertedId;
    }

    public async insertMany(values: T[], ordered: boolean): Promise<void> {
        Lumberjack.info(`mongodb-insertMany on ${this.collection} set ${JSON.stringify(values[0])}`);
        await this.collection.insertMany(values, { ordered: false });
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        try {
            const indexName = await this.collection.createIndex(index, { unique });
            Lumberjack.info(`Created index ${indexName}`);
        } catch (error) {
            Lumberjack.error(`Index creation failed`, error);
        }
    }

    public async createTTLIndex(index: any, expireAfterSeconds?: number): Promise<void> {
        Lumberjack.info(`mongodb-createTTLIndex on ${this.collection} set ${JSON.stringify(index)}`);
        await this.collection.createIndex(index, { expireAfterSeconds });
    }

    public async findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }> {
        Lumberjack.info(`mongodb-findOrCreate on ${this.collection} set ${JSON.stringify(value)}`);
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

    private async updateManyCore(filter: any, set: any, addToSet: any, upsert: boolean): Promise<void> {
        const update: any = {};
        if (set) {
            update.$set = set;
        }

        if (addToSet) {
            update.$addToSet = addToSet;
        }

        const options = { upsert };

        await this.collection.updateMany(filter, update, options);
    }
}

export class MongoDb implements core.IDb {
    constructor(private readonly client: MongoClient) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        return this.client.close();
    }

    public on(event: core.IDbEvents, listener: (...args: any[]) => void) {
        this.client.on(event, listener);
    }

    public collection<T>(name: string): core.ICollection<T> {
        const collection = this.client.db("admin").collection<T>(name);
        return new MongoCollection<T>(collection);
    }
}

interface IMongoDBConfig {
    operationsDbEndpoint: string;
    bufferMaxEntries: number | undefined;
    globalDbEndpoint?: string;
    globalDbEnabled?: boolean;
}

export class MongoDbFactory implements core.IDbFactory {
    private readonly operationsDbEndpoint: string;
    private readonly bufferMaxEntries?: number;
    private readonly globalDbEndpoint?: string;
    constructor(config: IMongoDBConfig) {
        const { operationsDbEndpoint, bufferMaxEntries, globalDbEnabled, globalDbEndpoint } = config;
        if (globalDbEnabled) {
            this.globalDbEndpoint = globalDbEndpoint;
        }
        assert(!!operationsDbEndpoint, `No endpoint provided`);
        this.operationsDbEndpoint = operationsDbEndpoint;
        this.bufferMaxEntries = bufferMaxEntries;
    }

    public async connect(global = false): Promise<core.IDb> {
        assert(!global || !!this.globalDbEndpoint, `No global endpoint provided
                 when trying to connect to global db.`);
        // Need to cast to any before MongoClientOptions due to missing properties in d.ts
        const options: MongoClientOptions = {
            autoReconnect: true,
            bufferMaxEntries: this.bufferMaxEntries ?? 50,
            keepAlive: true,
            keepAliveInitialDelay: 180000,
            reconnectInterval: 1000,
            reconnectTries: 100,
            socketTimeoutMS: 120000,
            useNewUrlParser: true,
        };

        const connection = await MongoClient.connect(
            global ?
                this.globalDbEndpoint :
                this.operationsDbEndpoint,
            options);

        return new MongoDb(connection);
    }
}
