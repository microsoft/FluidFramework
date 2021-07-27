/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "@fluidframework/server-services-core";
import { Lumber, QueuedMessageProperties } from "@fluidframework/server-services-telemetry";

export const setQueuedMessageProperties = (lumber: Lumber, message: IQueuedMessage) => {
    const propertyMap = new Map<string, any>([
        [QueuedMessageProperties.topic, message.topic],
        [QueuedMessageProperties.partition, message.partition],
        [QueuedMessageProperties.offset, message.offset]]);
    lumber.setProperties(propertyMap);
};
