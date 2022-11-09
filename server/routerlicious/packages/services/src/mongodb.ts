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

    public aggregate(pipeline: any, options?: any): AggregationCursor<T> {
        return this.collection.aggregate(pipeline, options);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
    public find(query: object, sort: any, limit = MaxFetchSize, skip?: number): Promise<T[]> {
        let queryCursor = this.collection
            .find(query)
            .sort(sort)
            .limit(limit);

        if (skip) {
            queryCursor = queryCursor.skip(skip);
        }
        return queryCursor.toArray();
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
    public async updateMany(filter: object, set: any, addToSet: any): Promise<void> {
        return this.updateManyCore(filter, set, addToSet, false);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async upsert(filter: object, set: any, addToSet: any): Promise<void> {
        return this.updateCore(filter, set, addToSet, true);
    }

    public async distinct(key: any, query: any): Promise<any> {
        return this.collection.distinct(key, query);
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
        try {
            const indexName = await this.collection.createIndex(index, { unique });
            Lumberjack.info(`Created index ${indexName}`);
        } catch (error) {
            Lumberjack.error(`Index creation failed`, error);
        }
    }

    public async createTTLIndex(index: any, expireAfterSeconds?: number): Promise<void> {
        await this.collection.createIndex(index, { expireAfterSeconds });
    }

    public async findOrCreate(query: any, value: T): Promise<{ value: T; existing: boolean; }> {
        const result = await this.collection.findOneAndUpdate(
            query,
            {
                $setOnInsert: value,
            },
            {
                returnOriginal: true,
                upsert: true,
            });

        return result.value
            ? { value: result.value, existing: true }
            : { value, existing: false };
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

    public async dropCollection(name: string): Promise<boolean> {
        return this.client.db("admin").dropCollection(name);
    }
}

interface IMongoDBConfig {
    operationsDbEndpoint: string;
    bufferMaxEntries: number | undefined;
    globalDbEndpoint?: string;
    globalDbEnabled?: boolean;
    connectionPoolMinSize?: number;
    connectionPoolMaxSize?: number;
}

export class MongoDbFactory implements core.IDbFactory {
    private readonly operationsDbEndpoint: string;
    private readonly bufferMaxEntries?: number;
    private readonly globalDbEndpoint?: string;
    private readonly connectionPoolMinSize?: number;
    private readonly connectionPoolMaxSize?: number;
    constructor(config: IMongoDBConfig) {
        const {
            operationsDbEndpoint,
            bufferMaxEntries,
            globalDbEnabled,
            globalDbEndpoint,
            connectionPoolMinSize,
            connectionPoolMaxSize,
        } = config;
        if (globalDbEnabled) {
            this.globalDbEndpoint = globalDbEndpoint;
        }
        assert(!!operationsDbEndpoint, `No endpoint provided`);
        this.operationsDbEndpoint = operationsDbEndpoint;
        this.bufferMaxEntries = bufferMaxEntries;
        this.connectionPoolMinSize = connectionPoolMinSize;
        this.connectionPoolMaxSize = connectionPoolMaxSize;
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
        if (this.connectionPoolMinSize) {
            options.minSize = this.connectionPoolMinSize;
        }

        if (this.connectionPoolMaxSize) {
            options.poolSize = this.connectionPoolMaxSize;
        }

        const connection = await MongoClient.connect(
            global ?
                this.globalDbEndpoint :
                this.operationsDbEndpoint,
            options);

        return new MongoDb(connection);
    }
}
