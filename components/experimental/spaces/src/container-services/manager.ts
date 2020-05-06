/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { BaseContainerService } from "@microsoft/fluid-aqueduct";

/**
 * The manager will be use as a container level provider/consumer manager
 */
export class Manager extends BaseContainerService {
    private readonly registry: Map<string, (() => void)[]> = new Map();

    registerProducer(type: string, listener: EventEmitter) {
        listener.on(type, () => {
            const map = this.registry.get(type);
            if (map) {
                // call all the callbacks
                map.forEach((value) => value());
            }
        });
    }

    registerListener(type: string, callback: () => void) {
        const map = this.registry.get(type);
        if (map) {
            // append to the map
            map.push(callback);
        }
        else {
            // set the first item
            this.registry.set(type, [callback]);
        }
    }
}
