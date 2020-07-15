/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as kafka from "node-rdkafka";

export interface IKafkaEndpoints {
	kafka: string[];
	zooKeeper?: string[]
}

export abstract class RdkafkaBase extends EventEmitter {
	constructor(
		protected readonly endpoints: IKafkaEndpoints,
		public readonly clientId: string,
		public readonly topic: string,
		private readonly numberOfPartitions: number = 32,
		private readonly replicationFactor: number = 3) {
		super();

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

		const newTopic: kafka.NewTopic = {
			topic: this.topic,
			num_partitions: this.numberOfPartitions,
			replication_factor: this.replicationFactor,
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
