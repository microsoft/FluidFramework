/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as kafka from "kafka-node";

export const defaultPartitionCount = 32;

export const defaultReplicationFactor = 3;

/**
 * Ensures that the provided topics exist
 * The topics will be created if they do not exist
 */
export async function ensureTopics(
    client: kafka.KafkaClient,
    topics: string[],
    partitions: number = defaultPartitionCount,
    replicationFactor: number = defaultReplicationFactor): Promise<void> {
    const topicExistsError = await new Promise<kafka.TopicsNotExistError | any | undefined>((resolve) =>
        client.topicExists(topics, (error) => error ? resolve(error) : resolve(undefined)));
    if (!topicExistsError) {
        // no error - the topics exist
        return;
    }

    const topicsNotExistError = topicExistsError as kafka.TopicsNotExistError;
    if (typeof (topicsNotExistError) !== "object" || typeof (topicsNotExistError.topics) !== "object") {
        throw new TypeError(`Failed to ensure topics. ${topicExistsError}`);
    }

    // create the missing topics
    return new Promise<void>((resolve, reject) => {
        const newTopics = Array.isArray(topicsNotExistError.topics) ?
            topicsNotExistError.topics :
            [topicsNotExistError.topics];

        client.createTopics(newTopics.map((topic) => {
            return {
                topic,
                partitions,
                replicationFactor,
            };
        }), (createTopicError, result) => {
            if (createTopicError) {
                reject(createTopicError);
            } else {
                const topicError = result.find((value) => value.error);
                if (topicError) {
                    reject(new Error(`Failed to create topic "${topicError.topic}". Error: ${topicError.error}`));
                } else {
                    resolve();
                }
            }
        });
    });
}
