/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "console";
import { cloneDeep } from "lodash";
import * as core from "@fluidframework/server-services-core";
import {
	AggregationCursor,
	Collection,
	Document,
	FindOneAndUpdateOptions,
	FindOptions,
	MongoClient,
	MongoClientOptions,
	OptionalUnlessRequiredId,
} from "mongodb";
import {
	BaseTelemetryProperties,
	Lumberjack,
	LumberEventName,
} from "@fluidframework/server-services-telemetry";
import { InMemoryApiCounters } from "@fluidframework/server-services-utils";
import { MongoErrorRetryAnalyzer } from "./mongoExceptionRetryRules";

const MaxFetchSize = 2000;
const MaxRetryAttempts = 3;
const InitialRetryIntervalInMs = 1000;
const errorSanitizationMessage = "FluidREDACTED";
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

/**
 * @internal
 */
export class MongoCollection<T extends Document> implements core.ICollection<T>, core.IRetryable {
	private readonly apiCounter = new InMemoryApiCounters();
	private readonly failedApiCounterSuffix = ".Failed";
	private consecutiveFailedCount = 0;
	constructor(
		private readonly collection: Collection<T>,
		public readonly retryEnabled = false,
		private readonly telemetryEnabled = false,
		private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
		private readonly collectionName: string,
		private readonly apiCounterIntervalMS: number,
		private readonly apiFailureRateTerminationThreshold: number,
		private readonly apiMinimumCountToEnableTermination: number,
		private readonly consecutiveFailedThresholdForLowerTotalRequests: number,
		private readonly isGlobalDb = false,
	) {
		setInterval(() => {
			if (!this.apiCounter.countersAreActive) {
				return;
			}
			const counters = this.apiCounter.getCounters();
			this.apiCounter.resetAllCounters();
			Lumberjack.info(
				`MongoCollection counter for collection ${this.collectionName}`,
				counters,
			);
			this.terminateBasedOnCounterThreshold(counters);
		}, this.apiCounterIntervalMS);
	}

	public async aggregate(pipeline: any, options?: any): Promise<AggregationCursor<T>> {
		const req = async () =>
			new Promise<AggregationCursor<T>>((resolve) =>
				resolve(this.collection.aggregate(pipeline, options)),
			);
		return this.requestWithRetry(req, "MongoCollection.aggregate");
	}

	public async find(query: object, sort: any, limit = MaxFetchSize, skip?: number): Promise<T[]> {
		const req: () => Promise<T[]> = async () => {
			let queryCursor = this.collection.find<T>(query).sort(sort).limit(limit);

			if (skip) {
				queryCursor = queryCursor.skip(skip);
			}
			return queryCursor.toArray();
		};
		return this.requestWithRetry(req, "MongoCollection.find", query);
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async findOne(query: object, options?: FindOptions): Promise<T | null> {
		const req: () => Promise<T | null> = async () => this.collection.findOne<T>(query, options);
		return this.requestWithRetry(
			req, // request
			"MongoCollection.findOne", // callerName
			query, // queryOrFilter
		);
	}

	public async findAll(): Promise<T[]> {
		const req: () => Promise<T[]> = async () => this.collection.find<T>({}).toArray();
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
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
				const result = await this.collection.insertOne(
					value as OptionalUnlessRequiredId<T>,
				);
				// Older mongo driver bug, this insertedId was objectId or 3.2 but changed to any ID type consumer provided.
				return result.insertedId;
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
				await this.collection.insertMany(values as OptionalUnlessRequiredId<T>[], {
					ordered: false,
				});
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
		value: any,
		options = {
			returnOriginal: true,
			upsert: true,
		},
	): Promise<{ value: T; existing: boolean }> {
		const req = async () => {
			try {
				const result = await this.collection.findOneAndUpdate(
					query,
					{ $setOnInsert: value },
					options,
				);

				return result.value
					? { value: result.value, existing: true }
					: { value, existing: false };
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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
		value: any,
		options: FindOneAndUpdateOptions = { returnDocument: "before" },
	): Promise<{ value: T; existing: boolean }> {
		const req = async () => {
			try {
				const result = await this.collection.findOneAndUpdate(
					query,
					{ $set: value },
					options,
				);

				return result.value
					? { value: result.value, existing: true }
					: { value, existing: false };
			} catch (sdkError) {
				const error = this.cloneError(sdkError);
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

	private async updateCore(filter: any, set: any, addToSet: any, options: any): Promise<any> {
		const update: any = {};
		if (set) {
			update.$set = set;
		}

		if (addToSet) {
			update.$addToSet = addToSet;
		}

		return this.collection.updateOne(filter, update, options);
	}

	private async updateManyCore(filter: any, set: any, addToSet: any, options: any): Promise<any> {
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
		try {
			const result = await core.runWithRetry<TOut>(
				request,
				callerName,
				MaxRetryAttempts, // maxRetries
				InitialRetryIntervalInMs, // retryAfterMs
				telemetryProperties,
				undefined, // shouldIgnoreError
				(e) => this.retryEnabled && this.mongoErrorRetryAnalyzer.shouldRetry(e), // ShouldRetry
				(error: any, numRetries: number, retryAfterInterval: number) =>
					numRetries * retryAfterInterval, // calculateIntervalMs
				(error) => {
					error.isGlobalDb = this.isGlobalDb;
					const facadeError = this.cloneError(error);
					this.sanitizeError(facadeError);
				} /* onErrorFn */,
				this.telemetryEnabled, // telemetryEnabled
			);
			this.apiCounter.incrementCounter(callerName);
			return result;
		} catch (err: any) {
			this.apiCounter.incrementCounter(`${callerName}${this.failedApiCounterSuffix}`);
			throw err;
		}
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

	private cloneError<TError>(error: TError): TError {
		try {
			return structuredClone(error);
		} catch (errCloning) {
			Lumberjack.warning(
				`Error cloning error object using cloneErrorDeep.`,
				undefined,
				errCloning,
			);
		}

		try {
			return cloneDeep(error);
		} catch (errCloning) {
			Lumberjack.warning(
				`Error cloning error object using cloneDeep.`,
				undefined,
				errCloning,
			);
		}

		try {
			return JSON.parse(JSON.stringify(error)) as TError;
		} catch (errCloning) {
			Lumberjack.warning(
				`Error cloning error object using JSON.stringify.`,
				undefined,
				errCloning,
			);
		}

		Lumberjack.error("Failed to clone error object. Using the shallow copy.", undefined, error);
		return { ...error };
	}

	private terminateBasedOnCounterThreshold(counters: Record<string, number>): void {
		if (this.apiFailureRateTerminationThreshold > 1) {
			return; // If threshold set more than 1, meaning we should never terminate and skip followings.
		}
		let totalCount = 0;
		let totalFailedCount = 0;
		for (const [apiName, apiCounter] of Object.entries(counters)) {
			totalCount += apiCounter;
			if (apiName.endsWith(this.failedApiCounterSuffix)) {
				totalFailedCount += apiCounter;
			}
		}

		const failureRate = totalFailedCount / totalCount;

		if (failureRate <= this.apiFailureRateTerminationThreshold) {
			this.consecutiveFailedCount = 0;
			return;
		}

		this.consecutiveFailedCount++;
		const logProperties = {
			failureRate,
			totalCount,
			totalFailedCount,
			apiFailureRateTerminationThreshold: this.apiFailureRateTerminationThreshold,
			apiMinimumCountToEnableTermination: this.apiMinimumCountToEnableTermination,
			consecutiveFailedCount: this.consecutiveFailedCount,
			consecutiveFailedThresholdForLowerTotalRequests:
				this.consecutiveFailedThresholdForLowerTotalRequests,
		};
		if (
			totalCount < this.apiMinimumCountToEnableTermination &&
			this.consecutiveFailedCount < this.consecutiveFailedThresholdForLowerTotalRequests
		) {
			Lumberjack.warning("Total count didn't meet min threshold", logProperties);
			return;
		}

		// This logic is to automate the process of terminates application if db become unfunctional, so
		// kubernetes would automatically handle the restart process.
		Lumberjack.warning("Failure rate more than threshold, terminating", logProperties);
		process.kill(process.pid, "SIGTERM");
	}
}

/**
 * @internal
 */
export class MongoDb implements core.IDb {
	constructor(
		private readonly client: MongoClient,
		private readonly retryEnabled = false,
		private readonly telemetryEnabled = false,
		private readonly mongoErrorRetryAnalyzer: MongoErrorRetryAnalyzer,
		private readonly apiCounterIntervalMS: number,
		private readonly apiFailureRateTerminationThreshold: number,
		private readonly apiMinimumCountToEnableTermination: number,
		private readonly consecutiveFailedThresholdForLowerTotalRequests: number,
		private readonly isGlobalDb = false,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public close(): Promise<void> {
		return this.client.close();
	}

	public on(event: core.IDbEvents, listener: (...args: any[]) => void) {
		this.client.on(event, listener);
	}

	public collection<T extends Document>(name: string, dbName = "admin"): core.ICollection<T> {
		const collection = this.client.db(dbName).collection<T>(name);
		return new MongoCollection<T>(
			collection,
			this.retryEnabled,
			this.telemetryEnabled,
			this.mongoErrorRetryAnalyzer,
			name,
			this.apiCounterIntervalMS,
			this.apiFailureRateTerminationThreshold,
			this.apiMinimumCountToEnableTermination,
			this.consecutiveFailedThresholdForLowerTotalRequests,
			this.isGlobalDb,
		);
	}

	public async healthCheck(dbName = "admin"): Promise<void> {
		await this.client
			.db(dbName)
			.command({ ping: 1 })
			.catch((error) => {
				error.healthCheckFailed = true;
				throw error;
			});
	}

	public async dropCollection(name: string, dbName = "admin"): Promise<boolean> {
		return this.client.db(dbName).dropCollection(name);
	}
}

/**
 * @internal
 */
export type ConnectionNotAvailableMode = "ruleBehavior" | "stop"; // Ideally we should have 'delayRetry' options, but that requires more refactor on our retry engine so hold for this mode;
const DefaultMongoDbMonitoringEvents = [
	"serverOpening",
	"serverClosed",
	"serverDescriptionChanged",
	"topologyOpening",
	"topologyClosed",
	"topologyDescriptionChanged",
	// "serverHeartbeatStarted", Comment out because this will be too often
	// "serverHeartbeatSucceeded", Comment out because this will be too often
	"serverHeartbeatFailed",
	// "commandStarted", Comment out because this will be too often
	// "commandSucceeded", Comment out because this will be too often
	// "commandFailed", Comment out because this will be too often
	"connectionPoolCreated",
	"connectionPoolReady",
	"connectionPoolClosed",
	// "connectionCreated", Comment out because this will be too often
	// "connectionReady", Comment out because this will be too often
	// "connectionClosed", Comment out because this will be too often
	// "connectionCheckOutStarted", Comment out because this will be too often
	"connectionCheckOutFailed",
	// "connectionCheckedOut", Comment out because this will be too often
	// "connectionCheckedIn", Comment out because this will be too often
	"connectionPoolCleared",
];
const DefaultHeartbeatFrequencyMS = 30000;
const DefaultKeepAliveInitialDelay = 60000;
const DefaultSocketTimeoutMS = 0;
const DefaultConnectionTimeoutMS = 120000;
const DefaultMinHeartbeatFrequencyMS = 10000;
const DefaultApiCounterIntervalMS = 60000;
// 1 means 100%, using 2 just for safety for incorrect calculations and meaning this feature disabled
const DefaultApiFailureRateTerminationThreshold = 2;
const DefaultApiMinimumCountToEnableTermination = 30;
const DefaultConsecutiveFailedThresholdForLowerTotalRequests = 3;
const DefaultServerSelectionTimeoutMS = 30000;

interface IMongoDBConfig {
	operationsDbEndpoint: string;
	globalDbEndpoint?: string;
	globalDbEnabled?: boolean;
	connectionPoolMinSize?: number;
	connectionPoolMaxSize?: number;
	directConnection?: boolean;
	facadeLevelRetry?: boolean;
	facadeLevelTelemetry?: boolean;
	facadeLevelRetryRuleOverride?: any;
	connectionNotAvailableMode?: ConnectionNotAvailableMode;
	dbMonitoringEventsList?: string[];
	heartbeatFrequencyMS?: number;
	keepAliveInitialDelay?: number;
	socketTimeoutMS?: number;
	connectionTimeoutMS?: number;
	minHeartbeatFrequencyMS?: number;
	apiCounterIntervalMS?: number;
	apiFailureRateTerminationThreshold?: number;
	apiMinimumCountToEnableTermination?: number;
	serverSelectionTimeoutMS?: number;
	consecutiveFailedThresholdForLowerTotalRequests: number;
}

/**
 * @internal
 */
export class MongoDbFactory implements core.IDbFactory {
	private readonly operationsDbEndpoint: string;
	private readonly globalDbEndpoint?: string;
	private readonly connectionPoolMinSize?: number;
	private readonly connectionPoolMaxSize?: number;
	private readonly directConnection: boolean;
	private readonly retryEnabled: boolean = false;
	private readonly telemetryEnabled: boolean = false;
	private readonly connectionNotAvailableMode: ConnectionNotAvailableMode = "ruleBehavior";
	private readonly retryRuleOverride: Map<string, boolean>;
	private readonly dbMonitoringEventsList: string[];
	private readonly heartbeatFrequencyMS: number;
	private readonly keepAliveInitialDelay: number;
	private readonly socketTimeoutMS: number;
	private readonly connectionTimeoutMS: number;
	private readonly minHeartbeatFrequencyMS: number;
	private readonly apiCounterIntervalMS: number;
	private readonly apiFailureRateTerminationThreshold: number;
	private readonly apiMinimumCountToEnableTermination: number;
	private readonly serverSelectionTimeoutMS: number;
	private readonly consecutiveFailedThresholdForLowerTotalRequests: number;

	constructor(config: IMongoDBConfig) {
		const {
			operationsDbEndpoint,
			globalDbEnabled,
			globalDbEndpoint,
			connectionPoolMinSize,
			connectionPoolMaxSize,
			directConnection,
			connectionNotAvailableMode,
			dbMonitoringEventsList,
			heartbeatFrequencyMS,
			keepAliveInitialDelay,
			socketTimeoutMS,
			connectionTimeoutMS,
			minHeartbeatFrequencyMS,
			apiCounterIntervalMS,
			apiFailureRateTerminationThreshold,
			apiMinimumCountToEnableTermination,
			serverSelectionTimeoutMS,
			consecutiveFailedThresholdForLowerTotalRequests,
		} = config;
		if (globalDbEnabled) {
			this.globalDbEndpoint = globalDbEndpoint;
		}
		assert(!!operationsDbEndpoint, `No endpoint provided`);
		this.operationsDbEndpoint = operationsDbEndpoint;
		this.connectionPoolMinSize = connectionPoolMinSize;
		this.connectionPoolMaxSize = connectionPoolMaxSize;
		this.connectionNotAvailableMode = connectionNotAvailableMode ?? "ruleBehavior";
		this.directConnection = directConnection ?? false;
		this.retryEnabled = config.facadeLevelRetry || false;
		this.telemetryEnabled = config.facadeLevelTelemetry || false;
		this.retryRuleOverride = config.facadeLevelRetryRuleOverride
			? new Map(Object.entries(config.facadeLevelRetryRuleOverride))
			: new Map();
		this.dbMonitoringEventsList = dbMonitoringEventsList ?? DefaultMongoDbMonitoringEvents;
		this.heartbeatFrequencyMS = heartbeatFrequencyMS ?? DefaultHeartbeatFrequencyMS;
		this.keepAliveInitialDelay = keepAliveInitialDelay ?? DefaultKeepAliveInitialDelay;
		this.socketTimeoutMS = socketTimeoutMS ?? DefaultSocketTimeoutMS;
		this.connectionTimeoutMS = connectionTimeoutMS ?? DefaultConnectionTimeoutMS;
		this.minHeartbeatFrequencyMS = minHeartbeatFrequencyMS ?? DefaultMinHeartbeatFrequencyMS;
		this.apiCounterIntervalMS = apiCounterIntervalMS ?? DefaultApiCounterIntervalMS;
		this.apiFailureRateTerminationThreshold =
			apiFailureRateTerminationThreshold ?? DefaultApiFailureRateTerminationThreshold;
		this.apiMinimumCountToEnableTermination =
			apiMinimumCountToEnableTermination ?? DefaultApiMinimumCountToEnableTermination;
		this.serverSelectionTimeoutMS = serverSelectionTimeoutMS ?? DefaultServerSelectionTimeoutMS;
		this.consecutiveFailedThresholdForLowerTotalRequests =
			consecutiveFailedThresholdForLowerTotalRequests ??
			DefaultConsecutiveFailedThresholdForLowerTotalRequests;
	}

	public async connect(global = false): Promise<core.IDb> {
		assert(
			!global || !!this.globalDbEndpoint,
			`No global endpoint provided
                 when trying to connect to global db.`,
		);
		// Need to cast to any before MongoClientOptions due to missing properties in d.ts
		const options: MongoClientOptions = {
			directConnection: this.directConnection ?? false,
			keepAlive: true,
			keepAliveInitialDelay: this.keepAliveInitialDelay,
			socketTimeoutMS: this.socketTimeoutMS,
			connectTimeoutMS: this.connectionTimeoutMS,
			heartbeatFrequencyMS: this.heartbeatFrequencyMS,
			minHeartbeatFrequencyMS: this.minHeartbeatFrequencyMS,
			serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
		};
		if (this.connectionPoolMinSize) {
			options.minPoolSize = this.connectionPoolMinSize;
		}

		if (this.connectionPoolMaxSize) {
			options.maxPoolSize = this.connectionPoolMaxSize;
		}

		const connection = await MongoClient.connect(
			global && this.globalDbEndpoint ? this.globalDbEndpoint : this.operationsDbEndpoint,
			options,
		);
		for (const monitoringEvent of this.dbMonitoringEventsList) {
			connection.on(monitoringEvent, (event) => {
				// Using an event here so that we can use geneva monitoring in the future if we want to build alerts.
				const eventWithName = { ...event, MonitoringEventName: monitoringEvent };
				const metric = Lumberjack.newLumberMetric(
					LumberEventName.MongoMonitoring,
					eventWithName,
				);
				metric.success(`Event recorded for ${monitoringEvent}`);
			});
		}
		Lumberjack.info("Added event listeners", this.dbMonitoringEventsList);

		const retryAnalyzer = MongoErrorRetryAnalyzer.getInstance(
			this.retryRuleOverride,
			this.connectionNotAvailableMode,
		);

		return new MongoDb(
			connection,
			this.retryEnabled,
			this.telemetryEnabled,
			retryAnalyzer,
			this.apiCounterIntervalMS,
			this.apiFailureRateTerminationThreshold,
			this.apiMinimumCountToEnableTermination,
			this.consecutiveFailedThresholdForLowerTotalRequests,
			global,
		);
	}
}
