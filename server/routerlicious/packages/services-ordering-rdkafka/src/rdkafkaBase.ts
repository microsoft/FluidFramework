/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContextErrorData } from "@fluidframework/server-services-core";
import type * as kafkaTypes from "node-rdkafka";
import { tryImportNodeRdkafka } from "./tryImport";

export interface IKafkaBaseOptions {
    numberOfPartitions: number;
    replicationFactor: number;
    disableTopicCreation?: boolean;
    sslCACertFilePath?: string;
    restartOnKafkaErrorCodes?: number[];
}

export interface IKafkaEndpoints {
    kafka: string[];
    zooKeeper?: string[];
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
        const rdKafkaHasSSLEnabled =
            kafka.features.filter((feature) => feature.toLowerCase().includes("ssl"));

        if (options?.sslCACertFilePath) {
            // If the use of SSL is desired, but rdkafka has not been built with SSL support,
            // throw an error making that clear to the user.
            if (!rdKafkaHasSSLEnabled) {
                throw new Error(
                    "Attempted to configure SSL, but rdkafka has not been built to support it. " +
                    "Please make sure OpenSSL is available and build rdkafka again.");
            }

            this.sslOptions = {
                "security.protocol": "ssl",
                "ssl.ca.location": options?.sslCACertFilePath,
            };
        }

        setTimeout(() => void this.initialize(), 1);
    }

    protected abstract connect(): void;

    private async initialize() {
        try {
            if (!this.options.disableTopicCreation) {
                await this.ensureTopics();
            }

            this.connect();
        } catch (ex) {
            this.error(ex);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.initialize();

            return;
        }
    }

    protected async ensureTopics() {
        const options: kafkaTypes.GlobalConfig = {
            "client.id": `${this.clientId}-admin`,
            "metadata.broker.list": this.endpoints.kafka.join(","),
            ...this.sslOptions,
        };

        const adminClient = this.kafka.AdminClient.create(options);

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
        const errorCodesToCauseRestart = this.options.restartOnKafkaErrorCodes ?? this.defaultRestartOnKafkaErrorCodes;

        if (RdkafkaBase.isObject(error)
            && errorCodesToCauseRestart.includes((error as kafkaTypes.LibrdKafkaError).code)) {
            errorData.restart = true;
        }

        this.emit("error", error, errorData);
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    protected static isObject(value: any): value is object {
        return value !== null && typeof (value) === "object";
    }
}
