/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Redis from "ioredis";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { getRedisClusterRetryStrategy } from "./redisUtils";

/**
 * Represents an interface for managing creation,
 * and authentication with a Redis client.
 */
export interface IRedisClientConnectionManager {
	/**
	 * @returns The Redis client.
	 */
	getRedisClient(): Redis.default | Redis.Cluster;

	/**
	 * Adds an error handler to the Redis client, which will print telemetry when an error is encountered.
	 *
	 * @param lumberProperties - Lumber properties to be added to the telemetry.
	 * @param errorMessage - The error message to be printed when an error is encountered.
	 * @param additionalLoggingFunctionality - A lambda function that adds additional error handling and/or logging behavior.
	 * If this lambda returns true it will completely override the existing error handling/logging, otherwise it will do both.
	 */
	addErrorHandler(
		lumberProperties?: Record<string, any>,
		errorMessage?: string,
		additionalLoggingFunctionality?: (error: Error) => boolean,
	): void;
}

export class RedisClientConnectionManager implements IRedisClientConnectionManager {
	private client: Redis.default | Redis.Cluster | undefined;
	private readonly redisOptions: Partial<Redis.RedisOptions & Redis.ClusterOptions>;
	private readonly enableClustering: boolean;
	private readonly slotsRefreshTimeout: number;
	private readonly retryDelays: {
		retryDelayOnFailover: number;
		retryDelayOnClusterDown: number;
		retryDelayOnTryAgain: number;
		retryDelayOnMoved: number;
		maxRedirections?: number;
	};

	constructor(
		redisOptions?: Partial<Redis.RedisOptions & Redis.ClusterOptions>,
		redisConfig?: any,
		enableClustering: boolean = false,
		slotsRefreshTimeout: number = 50000,
		retryDelays: {
			retryDelayOnFailover: number;
			retryDelayOnClusterDown: number;
			retryDelayOnTryAgain: number;
			retryDelayOnMoved: number;
			maxRedirections?: number;
		} = {
			retryDelayOnFailover: 100,
			retryDelayOnClusterDown: 100,
			retryDelayOnTryAgain: 100,
			retryDelayOnMoved: 100,
			maxRedirections: 16,
		},
		private readonly enableVerboseErrorLogging = false,
	) {
		this.enableClustering = enableClustering;
		this.slotsRefreshTimeout = slotsRefreshTimeout;
		this.retryDelays = retryDelays;
		if (!redisOptions && !redisConfig) {
			Lumberjack.error("Either redisOptions or redisConfig must be provided");
			throw new Error("Either redisOptions or redisConfig must be provided");
		} else if (!redisOptions && redisConfig) {
			Lumberjack.info("Using default redisOptions after reading from config");
			this.redisOptions = {
				host: redisConfig.host,
				port: redisConfig.port,
				password: redisConfig.pass,
				connectTimeout: redisConfig.connectTimeout,
				enableReadyCheck: true,
				maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
				enableOfflineQueue: redisConfig.enableOfflineQueue,
				retryStrategy: getRedisClusterRetryStrategy(redisConfig.retryStrategyParams),
			};
			if (redisConfig.enableAutoPipelining) {
				/**
				 * When enabled, all commands issued during an event loop iteration are automatically wrapped in a
				 * pipeline and sent to the server at the same time. This can improve performance by 30-50%.
				 * More info: https://github.com/luin/ioredis#autopipelining
				 */
				this.redisOptions.enableAutoPipelining = true;
				this.redisOptions.autoPipeliningIgnoredCommands = ["ping"];
			}
			if (redisConfig.tls) {
				this.redisOptions.tls = {
					servername: redisConfig.host,
				};
			}
		} else {
			Lumberjack.info("Using the provided redisOptions");
			// Adding this check here to avoid linting errors
			// If control-flow lands here, redisOptions will be defined
			if (!redisOptions) {
				Lumberjack.error("redisOptions must be provided");
				throw new Error("redisOptions must be provided");
			}
			this.redisOptions = redisOptions;
		}

		if (!this.redisOptions.retryStrategy) {
			this.redisOptions.retryStrategy = getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			});
		}
		this.authenticateAndCreateRedisClient();
	}

	private authenticateAndCreateRedisClient(): void {
		if (this.enableClustering) {
			this.redisOptions.clusterRetryStrategy = this.redisOptions.retryStrategy;
		}

		const redisClusteringOptions: Partial<Redis.ClusterOptions> = {
			redisOptions: this.redisOptions,
			slotsRefreshTimeout: this.slotsRefreshTimeout,
			dnsLookup: (adr, callback) => callback(null, adr),
			showFriendlyErrorStack: true,
			retryDelayOnFailover: this.retryDelays.retryDelayOnFailover,
			retryDelayOnClusterDown: this.retryDelays.retryDelayOnClusterDown,
			retryDelayOnTryAgain: this.retryDelays.retryDelayOnTryAgain,
			retryDelayOnMoved: this.retryDelays.retryDelayOnMoved,
			maxRedirections: this.retryDelays.maxRedirections,
		};

		// Remove password from the options objects that will be logged
		const loggableRedisOptions = { ...this.redisOptions };
		loggableRedisOptions.password = undefined;

		const loggableClusteringOptions = { ...redisClusteringOptions };
		loggableClusteringOptions.redisOptions = loggableRedisOptions;

		const stringifiedOptions = this.enableClustering
			? JSON.stringify(loggableClusteringOptions)
			: JSON.stringify(loggableRedisOptions);

		this.client = this.enableClustering
			? new Redis.Cluster(
					[{ port: this.redisOptions.port, host: this.redisOptions.host }],
					redisClusteringOptions,
			  )
			: new Redis.default(this.redisOptions);
		Lumberjack.info("Redis client created", {
			["constructorOptions"]: stringifiedOptions,
			["clusteringEnabled"]: this.enableClustering,
		});
	}

	public getRedisClient(): Redis.default | Redis.Cluster {
		if (!this.client) {
			throw new Error("Redis client not initialized");
		}
		return this.client;
	}

	private redactArg(arg: string, ind: number, commandName: string): string {
		// For some commands argument 0 is the key, meaning we can safely log it
		const safeCommands: string[] = ["get", "set", "del", "hget", "hset", "hdel"];
		if (ind === 0 && safeCommands.includes(commandName?.toLowerCase() ?? "")) {
			return arg;
		}

		return arg.length.toString();
	}

	public addErrorHandler(
		lumberProperties: Record<string, any> = {},
		errorMessage: string = "Error with Redis",
		additionalLoggingFunctionality?: (error: Error) => boolean,
	): void {
		if (!this.client) {
			throw new Error("Redis client not initialized");
		}

		this.client.on("error", (error) => {
			if (additionalLoggingFunctionality && additionalLoggingFunctionality(error)) {
				// If the additionalLoggingFunctionality returns true, it means it has completely handled the error
				return;
			}

			if (this.enableVerboseErrorLogging) {
				const commandName: string | undefined =
					error.command?.name ?? error.lastNodeError?.command?.name;
				const args: string[] =
					error.command?.args ?? error.lastNodeError?.command?.args ?? [];

				if (error.previousErrors) {
					// Internally redact the previous errors of an exec command
					lumberProperties.previousErrors = [];
					error.previousErrors?.forEach((prevError) => {
						if (prevError.command) {
							const prevCommandName: string | undefined = prevError.command.name;
							const prevArgs: string[] = prevError.command.args;
							const prevArgsRedacted: string[] = prevArgs.map((arg, ind) =>
								this.redactArg(arg, ind, prevCommandName ?? ""),
							);
							const prevErrorCopy = { ...prevError };
							prevErrorCopy.command.args = prevArgsRedacted;
							lumberProperties.previousErrors.push(prevErrorCopy);
						}
					});
				}
				const argSizes: string[] = args.map((arg, ind) =>
					this.redactArg(arg, ind, commandName ?? ""),
				);

				// Set additional logging info in lumberProperties
				lumberProperties.commandName = commandName;
				lumberProperties.commandArgSizes = argSizes;

				Lumberjack.error(errorMessage, lumberProperties, error);
			}
		});
	}
}
