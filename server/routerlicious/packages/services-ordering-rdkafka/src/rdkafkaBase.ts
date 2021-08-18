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
    sslCACertFilePath?: string;
}

export interface IKafkaEndpoints {
    kafka: string[];
    zooKeeper?: string[];
}

export abstract class RdkafkaBase extends EventEmitter {
    protected readonly kafka: typeof kafkaTypes;
    protected readonly sslOptions?: kafkaTypes.ConsumerGlobalConfig;
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
        console.log(`[KAFKA FEATURES]: ${kafka.features}`);
        this.options = {
            ...options,
            numberOfPartitions: options?.numberOfPartitions ?? 32,
            replicationFactor: options?.replicationFactor ?? 3,
        };

        // In RdKafka, we can check what features are enabled using kafka.features. If "ssl" is listed,
        // it means RdKafka has been built with support for SSL.
        const rdKafkaHasSSLEnabled =
            kafka.features.filter((feature) => feature.toLowerCase().indexOf("ssl") >= 0).length > 0;

        if (rdKafkaHasSSLEnabled && options?.sslCACertFilePath) {
            this.sslOptions = {
                "security.protocol": "ssl",
                "ssl.ca.location": options?.sslCACertFilePath,
            };
        }

        console.log(`[RDKAFKA SSL OPTIONS]: ${JSON.stringify(this.sslOptions)}`);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.initialize();
    }

    protected abstract connect(): void;

    private async initialize() {
        try {
            await this.ensureTopics();
        } catch (ex) {
            this.emit("error", ex);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.initialize();

            return;
        }

        this.connect();
    }

    protected async ensureTopics() {
        const options: kafkaTypes.GlobalConfig = {
            "client.id": `${this.clientId}-admin`,
            "metadata.broker.list": this.endpoints.kafka.join(","),
            ...this.sslOptions,
        };

        console.log(`[RDKAFKA ADMIN CLIENT OPTIONS]: ${JSON.stringify(options)}`);

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

    protected error(error: any, restartOnError: boolean = false) {
        const errorData: IContextErrorData = {
            restart: restartOnError,
        };

        this.emit("error", error, errorData);
    }
}
