import * as kafka from "kafka-node";

/**
 * Ensures that the provided topics are ready
 */
export function ensureTopics(client: kafka.Client, topics: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // We make use of a refreshMetadata call to validate the given topics exist
        client.refreshMetadata(
            topics,
            (error, data) => {
                if (error) {
                    console.error(error);
                    return reject();
                }

                return resolve();
            });
    });
}
