/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "@fluidframework/server-services-core";
import { Lumber } from "@fluidframework/server-services-telemetry";

enum QueuedMessageProperties {
    Topic = "Topic",
    Partition = "Partition",
    Offset = "Offset",
}

export const setQueuedMessageProperties = (lumber: Lumber, message: IQueuedMessage) => {
    const propertyMap = new Map<string, any>([
        [QueuedMessageProperties.Topic, message.topic],
        [QueuedMessageProperties.Partition, message.partition],
        [QueuedMessageProperties.Offset, message.offset]]);
    lumber.setProperties(propertyMap);
};
