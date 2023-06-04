/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "console";
import * as core from "@fluidframework/server-services-core";
import {
	AggregationCursor,
	Collection,
	FindOneOptions,
	MongoClient,
	MongoClientOptions,
} from "mongodb";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { MongoErrorRetryAnalyzer } from "./mongoExceptionRetryRules";

const MaxFetchSize = 2000;
const MaxRetryAttempts = 3;
const InitialRetryIntervalInMs = 1000;
const errorSanitizationMessage = "REDACTED";
const errorResponseKeysAllowList = new Set([
	"_id",
	"code",
	"codeName",
	"documentId",
	"driver",
	"err",
	"errmsg",
	"errorDetails",
	"errorLabels",
	"index",
	"insertedIds",
	"message",
	"mongoTimestamp",
	"name",
	"nInserted",
	"nMatched",
	"nModified",
	"nRemoved",
	"nUpserted",
	"ok",
	"result",
	"stack",
	"tenantId",
	"type",
	"upserted",
	"writeErrors",
	"writeConcernErrors",
]);

export class MongoCollection<T> implements core.ICollection<T>, core.IRetryable {
	constructor(
		private readonly collection: Collection<T>,
		public readonly retryEnabled = false,
		private readonly telemetryEnabled = false,
		private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
	) {}

	public async aggregate(pipeline: any, options?: any): Promise<AggregationCursor<T>> {
		const req = async () =>
			new Promise<AggregationCursor<T>>((resolve) =>
				resolve(this.collection.aggregate(pipeline, options)),
			);
		return this.requestWithRetry(req, "MongoCollection.aggregate");
	}

	public async find(query: object, sort: any, limit = MaxFetchSize, skip?: number): Promise<T[]> {
		const req: () => Promise<T[]> = async () => {
			let queryCursor = this.collection.find(query).sort(sort).limit(limit);

			if (skip) {
				queryCursor = queryCursor.skip(skip);
			}
			return queryCursor.toArray();
		};
		return this.requestWithRetry(req, "MongoCollection.find", query);
	}

	public async findOne(query: object, options?: FindOneOptions): Promise<T> {
		const req: () => Promise<T> = async () => this.collection.findOne(query, options);
		return this.requestWithRetry(
			req, // request
			"MongoCollection.findOne", // callerName
			query, // queryOrFilter
		);
	}

	public async findAll(): Promise<T[]> {
		const req: () => Promise<T[]> = async () => this.collection.find({}).toArray();
		return this.requestWithRetry(
			req, // request
			"MongoCollection.findAll", // callerName
		);
	}

	public async update(
		filter: object,
		set: any,
		addToSet: any,
		options: any = undefined,
	): Promise<void> {
		const mongoOptions = { ...options, upsert: false };
		const req = async () => {
			try {
				await this.updateCore(filter, set, addToSet, mongoOptions);
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.update", // callerName
			filter, // queryOrFilter
		);
	}

	public async updateMany(
		filter: object,
		set: any,
		addToSet: any,
		options: any = undefined,
	): Promise<void> {
		const mongoOptions = { ...options, upsert: false }; // This is a backward compatible change when passing in options to give more flexibility
		const req = async () => {
			try {
				await this.updateManyCore(filter, set, addToSet, mongoOptions);
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.updateMany", // callerName
			filter, // queryOrFilter
		);
	}

	public async upsert(
		filter: object,
		set: any,
		addToSet: any,
		options: any = undefined,
	): Promise<void> {
		const mongoOptions = { ...options, upsert: true };
		const req = async () => {
			try {
				await this.updateCore(filter, set, addToSet, mongoOptions);
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.upsert", // callerName
			filter, // queryOrFilter
		);
	}

	public async distinct(key: any, query: any): Promise<any> {
		const req = async () => this.collection.distinct(key, query);
		return this.requestWithRetry(
			req, // request
			"MongoCollection.distinct", // callerName
			query, // queryOrFilter
		);
	}

	public async deleteOne(filter: any): Promise<any> {
		const req = async () => this.collection.deleteOne(filter);
		return this.requestWithRetry(
			req, // request
			"MongoCollection.deleteOne", // callerName
			filter, // queryOrFilter
		);
	}

	public async deleteMany(filter: any): Promise<any> {
		const req = async () => this.collection.deleteMany(filter);
		return this.requestWithRetry(
			req, // request
			"MongoCollection.deleteMany", // callerName
			filter, // queryOrFilter
		);
	}

	public async insertOne(value: T): Promise<any> {
		const req = async () => {
			try {
				const result = await this.collection.insertOne(value);
				// Older mongo driver bug, this insertedId was objectId or 3.2 but changed to any ID type consumer provided.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return result.insertedId;
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.insertOne", // callerName
			value, // queryOrFilter
		);
	}

	public async insertMany(values: T[], ordered: boolean): Promise<void> {
		const req = async () => {
			try {
				await this.collection.insertMany(values, { ordered: false });
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		await this.requestWithRetry(
			req, // request
			"MongoCollection.insertMany", // callerName
		);
	}

	// Create indexes with unique restriction were always failing due to :
	// 1. We have existing data
	// 2. The unique restriction not on partition key for some collections.
	// The error will continue without a DB rebuild, which is a hard and long work.
	// Also create index mostly happened at service bootstrap time. If we bubble up at that time,
	// service will failed to start. So instead we need catch the exception and log it without bubbling up.
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

	// Create index mostly happened at service bootstrap time. If we bubble up at that time,
	// service will failed to start. So instead we need catch the exception and log it without bubbling up.
	public async createTTLIndex(index: any, expireAfterSeconds?: number): Promise<void> {
		const req = async () => this.collection.createIndex(index, { expireAfterSeconds });
		try {
			const indexName = await this.requestWithRetry(
				req, // request
				"MongoCollection.createTTLIndex", // callerName
			);
			Lumberjack.info(`Created TTL index ${indexName}`);
		} catch (error) {
			Lumberjack.error(`TTL Index creation failed`, undefined, error);
		}
	}

	public async findOrCreate(
		query: any,
		value: T,
		options = {
			returnOriginal: true,
			upsert: true,
		},
	): Promise<{ value: T; existing: boolean }> {
		const req = async () => {
			try {
				const result = await this.collection.findOneAndUpdate(
					query,
					{
						$setOnInsert: value,
					},
					options,
				);

				return result.value
					? { value: result.value, existing: true }
					: { value, existing: false };
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.findOrCreate", // callerName
			query, // queryOrFilter
		);
	}

	public async findAndUpdate(
		query: any,
		value: T,
		options = {
			returnOriginal: true,
		},
	): Promise<{ value: T; existing: boolean }> {
		const req = async () => {
			try {
				const result = await this.collection.findOneAndUpdate(
					query,
					{
						$set: value,
					},
					options,
				);

				return result.value
					? { value: result.value, existing: true }
					: { value, existing: false };
			} catch (error) {
				this.sanitizeError(error);
				throw error;
			}
		};
		return this.requestWithRetry(
			req, // request
			"MongoCollection.findAndUpdate", // callerName
			query, // queryOrFilter
		);
	}

	private async updateCore(filter: any, set: any, addToSet: any, options: any): Promise<void> {
		const update: any = {};
		if (set) {
			update.$set = set;
		}

		if (addToSet) {
			update.$addToSet = addToSet;
		}

		return this.collection.updateOne(filter, update, options);
	}

	private async updateManyCore(
		filter: any,
		set: any,
		addToSet: any,
		options: any,
	): Promise<void> {
		const update: any = {};
		if (set) {
			update.$set = set;
		}

		if (addToSet) {
			update.$addToSet = addToSet;
		}

		return this.collection.updateMany(filter, update, options);
	}

	private async requestWithRetry<TOut>(
		request: () => Promise<TOut>,
		callerName: string,
		queryOrFilter?: any,
	): Promise<TOut> {
		const telemetryProperties = this.getTelemetryPropertiesFromQuery(queryOrFilter);
		return core.runWithRetry<TOut>(
			request,
			callerName,
			MaxRetryAttempts, // maxRetries
			InitialRetryIntervalInMs, // retryAfterMs
			telemetryProperties,
			(e) => e.code === 11000, // shouldIgnoreError
			(e) => this.retryEnabled && this.mongoErrorRetryAnalyzer.shouldRetry(e), // ShouldRetry
			(error: any, numRetries: number, retryAfterInterval: number) =>
				numRetries * retryAfterInterval, // calculateIntervalMs
			(error) => this.sanitizeError(error) /* onErrorFn */,
			this.telemetryEnabled, // telemetryEnabled
		);
	}

	private getTelemetryPropertiesFromQuery(
		queryOrFilter?: any,
	): Map<string, any> | Record<string, any> {
		const properties: Map<string, any> = new Map();
		if (!queryOrFilter) {
			return properties;
		}

		if (Object.prototype.hasOwnProperty.call(queryOrFilter, "_id")) {
			properties.set("id", queryOrFilter._id);
		}

		if (Object.prototype.hasOwnProperty.call(queryOrFilter, "tenantId")) {
			properties.set(BaseTelemetryProperties.tenantId, queryOrFilter.tenantId);
		}

		if (Object.prototype.hasOwnProperty.call(queryOrFilter, "documentId")) {
			properties.set(BaseTelemetryProperties.documentId, queryOrFilter.documentId);
		}

		return properties;
	}

	private sanitizeError(error: any) {
		if (error) {
			try {
				Object.keys(error).forEach((key) => {
					if (key === "_id" || /^\d+$/.test(key)) {
						// skip mongodb's ObjectId and array indexes
						return;
					} else if (typeof error[key] === "object") {
						this.sanitizeError(error[key]);
					} else if (!errorResponseKeysAllowList.has(key)) {
						error[key] = errorSanitizationMessage;
					}
				});
			} catch (err) {
				Lumberjack.error(`Error sanitization failed.`, undefined, err);
				throw err;
			}
		}
	}
}

export class MongoDb implements core.IDb {
	constructor(
		private readonly client: MongoClient,
		private readonly retryEnabled = false,
		private readonly telemetryEnabled = false,
		private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public close(): Promise<void> {
		return this.client.close();
	}

	public on(event: core.IDbEvents, listener: (...args: any[]) => void) {
		this.client.on(event, listener);
	}

	public collection<T>(name: string, dbName = "admin"): core.ICollection<T> {
		const collection = this.client.db(dbName).collection<T>(name);
		return new MongoCollection<T>(
			collection,
			this.retryEnabled,
			this.telemetryEnabled,
			this.mongoErrorRetryAnalyzer,
		);
	}

	public async dropCollection(name: string, dbName = "admin"): Promise<boolean> {
		return this.client.db(dbName).dropCollection(name);
	}
}

export type ConnectionNotAvailableMode = "ruleBehavior" | "stop"; // Ideally we should have 'delayRetry' options, but that requires more refactor on our retry engine so hold for this mode;

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
	connectionNotAvailableMode?: ConnectionNotAvailableMode;
}

export class MongoDbFactory implements core.IDbFactory {
	private readonly operationsDbEndpoint: string;
	private readonly bufferMaxEntries?: number;
	private readonly globalDbEndpoint?: string;
	private readonly connectionPoolMinSize?: number;
	private readonly connectionPoolMaxSize?: number;
	private readonly retryEnabled: boolean = false;
	private readonly telemetryEnabled: boolean = false;
	private readonly connectionNotAvailableMode: ConnectionNotAvailableMode = "ruleBehavior";
	private readonly retryRuleOverride: Map<string, boolean>;
	constructor(config: IMongoDBConfig) {
		const {
			operationsDbEndpoint,
			bufferMaxEntries,
			globalDbEnabled,
			globalDbEndpoint,
			connectionPoolMinSize,
			connectionPoolMaxSize,
			connectionNotAvailableMode,
		} = config;
		if (globalDbEnabled) {
			this.globalDbEndpoint = globalDbEndpoint;
		}
		assert(!!operationsDbEndpoint, `No endpoint provided`);
		this.operationsDbEndpoint = operationsDbEndpoint;
		this.bufferMaxEntries = bufferMaxEntries;
		this.connectionPoolMinSize = connectionPoolMinSize;
		this.connectionPoolMaxSize = connectionPoolMaxSize;
		this.connectionNotAvailableMode = connectionNotAvailableMode ?? "ruleBehavior";
		this.retryEnabled = config.facadeLevelRetry || false;
		this.telemetryEnabled = config.facadeLevelTelemetry || false;
		this.retryRuleOverride = config.facadeLevelRetryRuleOverride
			? new Map(Object.entries(config.facadeLevelRetryRuleOverride))
			: new Map();
	}

	public async connect(global = false): Promise<core.IDb> {
		assert(
			!global || !!this.globalDbEndpoint,
			`No global endpoint provided
                 when trying to connect to global db.`,
		);
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
			global ? this.globalDbEndpoint : this.operationsDbEndpoint,
			options,
		);

		const retryAnalyzer = MongoErrorRetryAnalyzer.getInstance(
			this.retryRuleOverride,
			this.connectionNotAvailableMode,
		);

		return new MongoDb(connection, this.retryEnabled, this.telemetryEnabled, retryAnalyzer);
	}
}
