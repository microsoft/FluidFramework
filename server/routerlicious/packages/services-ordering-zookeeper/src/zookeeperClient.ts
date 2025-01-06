/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

import { IZookeeperClient } from "@fluidframework/server-services-core";
import type ZooKeeper from "zookeeper";

/**
 * @internal
 */
export class ZookeeperClient implements IZookeeperClient {
	private client!: ZooKeeper;

	constructor(private readonly url: string) {
		this.connect();
	}

	public async getPartitionLeaderEpoch(topic: string, partition: number) {
		const path = `/brokers/topics/${topic}/partitions/${partition}/state`;
		return this.client.get(path, false).then((data) => {
			// `data` is typed incorrectly. Instead of string | Buffer, it is an array like [object, Buffer].
			const state = data[1].toString("utf8");
			return JSON.parse(state).leader_epoch as number;
		});
	}

	public close() {
		if (this.client) {
			this.client.removeAllListeners();
			this.client.close();
			// This is necessary to make sure the client is not reused.
			// If accessed after close, it will correctly throw a fatal type error.
			this.client = undefined as unknown as ZooKeeper;
		}
	}

	private connect() {
		// Only import this module when it's going to be used
		// Using zookeeper with services-ordering-rdkafka is optional,
		// so the service should not fail if this cannot be imported
		const zooKeeper = require("zookeeper");

		this.client = new zooKeeper({
			connect: this.url,
			timeout: 30000,
		});
		this.client.once("connect", () => {
			this.client.once("close", () => {
				this.close();
				this.connect();
			});
		});
		this.client.init({});
	}
}
