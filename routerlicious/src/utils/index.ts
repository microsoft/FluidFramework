export * from "./batchManager";
export * from "./conversion";
export * from "./counters";
export * from "./file";
export * from "./heap";
export * from "./logger";
export * from "./mongo";
export * from "./response";
export * from "./runner";

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

import * as scribe from "./scribe";
export { scribe };

import * as kafkaConsumer from "./kafkaConsumer";
export { kafkaConsumer };

import * as kafkaProducer from "./kafkaProducer";
export { kafkaProducer };

export { ResumeIntelligentSerivce } from "./resumeIntelligence";
