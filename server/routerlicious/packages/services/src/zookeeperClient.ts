/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IZookeeperClient } from "@microsoft/fluid-server-services-core";
import * as zookeeper from "node-zookeeper-client";

const RetryAttemps = 3;

export class ZookeeperClient implements IZookeeperClient {
    private client: zookeeper.Client;

    constructor(private readonly url: string) {
        this.connect();
    }

    public async getPartitionLeaderEpoch(topic: string, partition: number) {
        const path = `/brokers/topics/${topic}/partitions/${partition}/state`;
        return new Promise<number>((resolve, reject) => {
            this.client.getData(path, (error, data, stat) => {
                if (error) {
                    reject(error);
                } else {
                    const state = data.toString("utf8");
                    resolve(JSON.parse(state).leader_epoch);
                }
            });
        });
    }

    public close() {
        if (this.client) {
            this.client.removeAllListeners();
            this.client.close();
            this.client = undefined;
        }
    }

    private connect() {
        this.client = zookeeper.createClient(this.url, { retries: RetryAttemps });
        this.client.connect();
        this.client.once("connected", () => {
            this.client.once("disconnected", () => {
                this.close();
                this.connect();
            });
        });
    }
}
