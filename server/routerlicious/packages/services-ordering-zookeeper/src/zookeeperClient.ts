/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IZookeeperClient } from "@fluidframework/server-services-core";
import ZooKeeper from "zookeeper";

export class ZookeeperClient implements IZookeeperClient {
    private client: ZooKeeper;

    constructor(private readonly url: string) {
        this.connect();
    }

    public async getPartitionLeaderEpoch(topic: string, partition: number) {
        const path = `/brokers/topics/${topic}/partitions/${partition}/state`;
        return this.client.get(path, false).then((data) => {
            // `data` is typed incorrectly. Instead of string | Buffer, it is an array like [object, Buffer].
            const state = (data[1] as string | Buffer).toString("utf8");
            return JSON.parse(state).leader_epoch as number;
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
        this.client = new ZooKeeper({
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
