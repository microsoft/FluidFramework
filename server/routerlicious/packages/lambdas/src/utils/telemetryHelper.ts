/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "@fluidframework/server-services-core";
import { Lumber } from "@fluidframework/server-services-telemetry";

export const setQueuedMessageProperties = (lumber: Lumber, message: IQueuedMessage) => {
    const propertyMap = new Map<string, any>([
        ["topic", message.topic],
        ["partition", message.partition],
        ["offset", message.offset]]);
    lumber.setProperties(propertyMap);
};
