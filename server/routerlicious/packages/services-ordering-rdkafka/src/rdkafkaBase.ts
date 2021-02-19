/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type * as kafkaTypes from "node-rdkafka";
import { tryImportNodeRdkafka } from "./tryImport";

// The native dependency of node-rdkafka throws an error when installing in one environment (e.g., macOS) and running
// inside another (e.g., docker ubuntu). The issue only occurs because we volume mount code directly into docker
// for local dev flow. Using a pre-built image works fine (https://github.com/Blizzard/node-rdkafka/issues/315).
// Because of this limitation, currently we cannot use node-rdkafka in local dev flow. So locally kafka config should
// always point to kafka-node library. Production code can use either one of those.
const kafka = tryImportNodeRdkafka();

export interface IKafkaBaseOptions {
	numberOfPartitions: number;
	replicationFactor: number;
}

export interface IKafkaEndpoints {
	kafka: string[];
	zooKeeper?: string[];
}

export abstract class RdkafkaBase extends EventEmitter {
	private readonly options: IKafkaBaseOptions;

	constructor(
		protected readonly endpoints: IKafkaEndpoints,
		public readonly clientId: string,
		public readonly topic: string,
		options?: Partial<IKafkaBaseOptions>,
	) {
		super();

		if (!kafka) {
			throw new Error("Invalid node-rdkafka package");
		}

		this.options = {
			...options,
			numberOfPartitions: options?.numberOfPartitions ?? 32,
			replicationFactor: options?.replicationFactor ?? 3,
		};

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
		const adminClient = kafka.AdminClient.create({
			"client.id": `${this.clientId}-admin`,
			"metadata.broker.list": this.endpoints.kafka.join(","),
		});

		const newTopic: kafkaTypes.NewTopic = {
			topic: this.topic,
			num_partitions: this.options.numberOfPartitions,
			replication_factor: this.options.replicationFactor,
		};

		return new Promise<void>((resolve, reject) => {
			adminClient.createTopic(newTopic, 10000, (err) => {
				adminClient.disconnect();

				if (err && err.code !== kafka.CODES.ERRORS.ERR_TOPIC_ALREADY_EXISTS) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}
}
