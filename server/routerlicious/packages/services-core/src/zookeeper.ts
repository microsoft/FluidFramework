/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type ZookeeperClientConstructor = new (url: string) => IZookeeperClient;

/**
 * Interface for a Zookeeper Client
 */
export interface IZookeeperClient {
    /**
     * Retrieves the leader epoch for a given topic and partition.
     */
    getPartitionLeaderEpoch(topic: string, partition: number): Promise<number>;

    /**
     * Closes the client session.
     */
    close(): void;
}
