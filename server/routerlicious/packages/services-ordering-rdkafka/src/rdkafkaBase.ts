/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IContextErrorData } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type * as kafkaTypes from "node-rdkafka";

import { tryImportNodeRdkafka } from "./tryImport";

export interface IKafkaBaseOptions {
	numberOfPartitions: number;
	replicationFactor: number;
	disableTopicCreation?: boolean;
	sslCACertFilePath?: string;
	restartOnKafkaErrorCodes?: number[];
	eventHubConnString?: string;
	oauthBearerConfig?: any;
}

export interface IKafkaEndpoints {
	kafka: string[];
	zooKeeper?: string[];
}

export interface IOauthBearerResponse {
	tokenStr: string;
	refreshInMs: number;
}

export interface IOauthBearerConfig {
	tokenProvider: () => Promise<IOauthBearerResponse>;
}

export abstract class RdkafkaBase extends EventEmitter {
	protected readonly kafka: typeof kafkaTypes;
	protected readonly sslOptions?: kafkaTypes.ConsumerGlobalConfig;
	protected defaultRestartOnKafkaErrorCodes: number[] = [];
	private readonly options: IKafkaBaseOptions;

	constructor(
		protected readonly endpoints: IKafkaEndpoints,
		public readonly clientId: string,
		public readonly topic: string,
		options?: Partial<IKafkaBaseOptions>,
	) {
		super();

		const kafka = tryImportNodeRdkafka();
		if (!kafka) {
			throw new Error("Invalid node-rdkafka package");
		}

		this.kafka = kafka;
		this.options = {
			...options,
			numberOfPartitions: options?.numberOfPartitions ?? 32,
			replicationFactor: options?.replicationFactor ?? 3,
		};

		// In RdKafka, we can check what features are enabled using kafka.features. If "ssl" is listed,
		// it means RdKafka has been built with support for SSL.
		// To build node-rdkafka with SSL support, make sure OpenSSL libraries are available in the
		// environment node-rdkafka would be running. Once OpenSSL is available, building node-rdkafka
		// as usual will automatically include SSL support.
		const lcKafkaFeatures = kafka.features.map((s) => s.toLowerCase());
		if (options?.sslCACertFilePath) {
			// If the use of SSL is desired, but rdkafka has not been built with SSL support,
			// throw an error making that clear to the user.
			if (!lcKafkaFeatures.includes("ssl")) {
				throw new Error(
					"Attempted to configure SSL, but rdkafka has not been built to support it. " +
						"Please make sure OpenSSL is available and build rdkafka again.",
				);
			}

			this.sslOptions = {
				"security.protocol": "ssl",
				"ssl.ca.location": options?.sslCACertFilePath,
			};
		} else if (options?.oauthBearerConfig) {
			if (!lcKafkaFeatures.includes("ssl") || !lcKafkaFeatures.includes("sasl_oauthbearer")) {
				throw new Error(
					"Attempted to configure SASL_OAUTHBEARER for OAUTHBEARER, but rdkafka has not been built to support it. " +
						"Please make sure OpenSSL is available and build rdkafka again.",
				);
			}

			if (
				!options.oauthBearerConfig.tokenProvider ||
				typeof options.oauthBearerConfig.tokenProvider !== "function"
			) {
				throw new Error("oauthBearerConfig is malformed");
			}

			this.sslOptions = {
				"security.protocol": "sasl_ssl",
				"sasl.mechanisms": "OAUTHBEARER",
			};
		} else if (options?.eventHubConnString) {
			if (!lcKafkaFeatures.includes("ssl") || !lcKafkaFeatures.includes("sasl")) {
				throw new Error(
					"Attempted to configure SASL_SSL for Event Hubs, but rdkafka has not been built to support it. " +
						"Please make sure OpenSSL is available and build rdkafka again.",
				);
			}

			this.sslOptions = {
				"security.protocol": "sasl_ssl",
				"sasl.mechanisms": "PLAIN",
				"sasl.username": "$ConnectionString",
				"sasl.password": options?.eventHubConnString,
			};
		}

		setTimeout(() => void this.initialize(), 1);
	}

	protected abstract connect(): Promise<void>;

	protected async setOauthBearerTokenIfNeeded(client: kafkaTypes.Client<any>) {
		if (!this.options.oauthBearerConfig?.tokenProvider) {
			return;
		}

		Lumberjack.info("Setting up kafka client with oauthbearer token provider");

		const tokenResponse = await this.options.oauthBearerConfig.tokenProvider();

		if (!tokenResponse?.tokenStr || !tokenResponse?.refreshInMs) {
			Lumberjack.error("Token provider returned malformed return value");
			throw new Error("Token provider returned malformed return value");
		}

		if (tokenResponse.refreshInMs <= 0) {
			Lumberjack.error("Token provider returned zero or negative 'refreshInMs'");
			throw new Error("Token provider returned zero or negative 'refreshInMs'");
		}

		client.setOauthBearerToken(tokenResponse.tokenStr);

		setTimeout(() => {
			this.setOauthBearerTokenIfNeeded(client).catch((err) => {
				Lumberjack.error("OAuthBearer token refresh has failed", undefined, err);
			});
		}, tokenResponse.refreshInMs).unref();
	}

	private async initialize() {
		try {
			if (!this.options.disableTopicCreation) {
				await this.ensureTopics();
			}

			await this.connect();
		} catch (ex) {
			this.error(ex, {
				restart: false,
				errorLabel: `${this.constructor.name}:rdKafkaBase:initialize`,
			});

			this.initialize().catch((error) => {
				Lumberjack.error("Error initializing rdkafka", undefined, error);
			});

			return;
		}
	}

	protected async ensureTopics() {
		const options: kafkaTypes.GlobalConfig = {
			"client.id": `${this.clientId}-admin`,
			"metadata.broker.list": this.endpoints.kafka.join(","),
			...this.sslOptions,
		};

		let oauthBearerToken;
		if (this.options.oauthBearerConfig?.tokenProvider) {
			const tokenResponse = await this.options.oauthBearerConfig.tokenProvider();
			oauthBearerToken = tokenResponse?.tokenStr;
		}

		const adminClient = this.kafka.AdminClient.create(options, oauthBearerToken);

		const newTopic: kafkaTypes.NewTopic = {
			topic: this.topic,
			num_partitions: this.options.numberOfPartitions,
			replication_factor: this.options.replicationFactor,
		};

		return new Promise<void>((resolve, reject) => {
			adminClient.createTopic(newTopic, 10000, (err) => {
				adminClient.disconnect();

				if (err && err.code !== this.kafka.CODES.ERRORS.ERR_TOPIC_ALREADY_EXISTS) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	protected error(error: any, errorData: IContextErrorData = { restart: false }) {
		const errorCodesToCauseRestart =
			this.options.restartOnKafkaErrorCodes ?? this.defaultRestartOnKafkaErrorCodes;

		if (
			RdkafkaBase.isObject(error) &&
			errorCodesToCauseRestart.includes((error as kafkaTypes.LibrdKafkaError).code)
		) {
			errorData.restart = true;
		}

		this.emit("error", error, errorData);
	}

	protected static isObject(value: any): value is object {
		return value !== null && typeof value === "object";
	}
}
