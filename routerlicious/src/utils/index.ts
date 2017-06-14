export * from "./batchManager";
export * from "./counters";
export * from "./heap";
export * from "./mongo";
export * from "./promises";

export interface ISharedAccessPolicy {
    sharedAccessKeyName: string;
    sharedAccessKey: string;
}

/**
 * Helper function to create an Azure Event Hub connection string from the provided parameters
 */
export function getEventHubConnectionString(
    endpoint: string,
    policy: ISharedAccessPolicy): string {
    // tslint:disable-next-line:max-line-length
    return `Endpoint=sb://${endpoint}/;SharedAccessKeyName=${policy.sharedAccessKeyName};SharedAccessKey=${policy.sharedAccessKey}`;
}

import * as kafka from "./kafka";
export { kafka };

import * as scribe from "./scribe";
export { scribe };

import * as cpkafka from "./cpkafka";
export { cpkafka };