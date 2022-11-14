/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "console";
import * as core from "@fluidframework/server-services-core";
import { AggregationCursor, Collection, MongoClient, MongoClientOptions } from "mongodb";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { requestWithRetry } from "@fluidframework/server-services-core";
import { MongoErrorRetryAnalyzer } from "./mongoExceptionRetryRules";

const MaxFetchSize = 2000;

export class MongoCollection<T> implements core.ICollection<T>, core.IRetryAble {
    constructor(
        private readonly collection: Collection<T>,
        public readonly retryEnabled = false,
        private readonly telemetryEnabled = false,
        private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
    ) { }

    public async aggregate(pipeline: any, options?: any): Promise<AggregationCursor<T>> {
        const req = async () => new Promise<AggregationCursor<T>>(
            (resolve) => resolve(this.collection.aggregate(pipeline, options)));
        return this.requestWithRetry(req, "MongoCollection.aggregate");
    }

    public async find(query: object, sort: any, limit = MaxFetchSize, skip?: number): Promise<T[]> {
        const req: () => Promise<T[]> = async () => {
            let queryCursor = this.collection
                .find(query)
                .sort(sort)
                .limit(limit);

            if (skip) {
                queryCursor = queryCursor.skip(skip);
            }
            return queryCursor.toArray();
        };
        return this.requestWithRetry(req, "MongoCollection.find");
    }

    public async findOne(query: object): Promise<T> {
        const req: () => Promise<T> = async () => this.collection.findOne(query);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.findAll", // callerName
        );
    }

    public async findAll(): Promise<T[]> {
        const req: () => Promise<T[]> = async () => this.collection.find({}).toArray();
        return this.requestWithRetry(
            req, // request
            "MongoCollection.findAll", // callerName
        );
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async update(filter: object, set: any, addToSet: any): Promise<void> {
        const req = async () => this.updateCore(filter, set, addToSet, false);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.update", // callerName
        );
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async updateMany(filter: object, set: any, addToSet: any): Promise<void> {
        const req = async () => this.updateManyCore(filter, set, addToSet, false);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.updateMany", // callerName
        );
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    public async upsert(filter: object, set: any, addToSet: any): Promise<void> {
        const req = async () => this.updateCore(filter, set, addToSet, true);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.upsert", // callerName
        );
    }

    public async distinct(key: any, query: any): Promise<any> {
        const req = async () => this.collection.distinct(key, query);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.distinct", // callerName
        );
    }

    public async deleteOne(filter: any): Promise<any> {
        const req = async () => this.collection.deleteOne(filter);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.deleteOne", // callerName
        );
    }

    public async deleteMany(filter: any): Promise<any> {
        const req = async () => this.collection.deleteMany(filter);
        return this.requestWithRetry(
            req, // request
            "MongoCollection.deleteMany", // callerName
        );
    }

    public async insertOne(value: T): Promise<any> {
        const req = async () => {
            const result = await this.collection.insertOne(value);
            return result.insertedId;
        };
        return this.requestWithRetry(
            req, // request
            "MongoCollection.insertOne", // callerName
        );
    }

    public async insertMany(values: T[], ordered: boolean): Promise<void> {
        const req = async () => this.collection.insertMany(values, { ordered: false });
        await this.requestWithRetry(
            req, // request
            "MongoCollection.insertMany", // callerName
        );
    }

    public async createIndex(index: any, unique: boolean): Promise<void> {
        const req = async () => this.collection.createIndex(index, { unique });
        try {
            const indexName = await this.requestWithRetry(
                req, // request
                "MongoCollection.createIndex", // callerName
            );
            Lumberjack.info(`Created index ${indexName}`);
        } catch (error) {
            Lumberjack.error(`Index creation failed`, undefined, error);
        }
    }

    public async createTTLIndex(index: any, expireAfterSeconds?: number): Promise<void> {
        const req = async () => this.collection.createIndex(index, { expireAfterSeconds });
        try {
            const indexName = await this.requestWithRetry(
                req, // request
                "MongoCollection.createTTLIndex", // callerName
            );
            Lumberjack.info(`Created index ${indexName}`);
        } catch (error) {
            Lumberjack.error(`Index creation failed`, undefined, error);
        }
    }

    public async findOrCreate(query: any, value: T): Promise<{ value: T; existing: boolean; }> {
        const req = async () => {
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
        };
        return this.requestWithRetry(
            req, // request
            "MongoCollection.findOrCreate", // callerName
        );
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

    private async requestWithRetry<TOut>(request: () => Promise<TOut>, callerName: string): Promise<TOut> {
        return requestWithRetry<TOut>(
            request,
            callerName,
            {}, // telemetryProperties
            (e) => this.retryEnabled && this.mongoErrorRetryAnalyzer.shouldRetry(e), // ShouldRetry
            3, // maxRetries
            1000, // retryAfterMs
            (error: any, numRetries: number, retryAfterInterval: number) =>
                numRetries * retryAfterInterval, // retryAfterIntervalCalculator
            undefined, /* onErrorFn */
            this.telemetryEnabled, // telemetryEnabled
        );
    }
}

export class MongoDb implements core.IDb {
    constructor(
        private readonly client: MongoClient,
        private readonly retryEnabled = false,
        private readonly telemetryEnabled = false,
        private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
    ) {
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
        return new MongoCollection<T>(
            collection,
            this.retryEnabled,
            this.telemetryEnabled,
            this.mongoErrorRetryAnalyzer);
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
    facadeLevelRetry?: boolean;
    facadeLevelTelemetry?: boolean;
    facadeLevelRetryRuleOverride?: any;
}

export class MongoDbFactory implements core.IDbFactory {
    private readonly operationsDbEndpoint: string;
    private readonly bufferMaxEntries?: number;
    private readonly globalDbEndpoint?: string;
    private readonly connectionPoolMinSize?: number;
    private readonly connectionPoolMaxSize?: number;
    private readonly retryEnabled: boolean = false;
    private readonly telemetryEnabled: boolean = false;
    private readonly retryRuleOverride: Map<string, boolean>;
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
        this.retryEnabled = config.facadeLevelRetry || false;
        this.telemetryEnabled = config.facadeLevelTelemetry || false;
        this.retryRuleOverride = config.facadeLevelRetryRuleOverride
            ? new Map(Object.entries(config.facadeLevelRetryRuleOverride))
            : new Map();
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

        const retryAnalyzer = MongoErrorRetryAnalyzer.getInstance(this.retryRuleOverride);

        return new MongoDb(connection, this.retryEnabled, this.telemetryEnabled, retryAnalyzer);
    }
}
