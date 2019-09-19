/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

/**
 * Simple IPlatform that exposes access to the "div" interface. This provides attached components a node in the DOM
 * to render to.
 */
export class HostPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public async queryInterface(id: string): Promise<any> {
        if (id === "div") {
            return this.div;
        } else {
            return null;
        }
    }

    public async detach() {
        return;
    }
}
