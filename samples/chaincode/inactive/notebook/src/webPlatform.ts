/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPlatform, IPlatformFactory } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class WebPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    // Temporary measure to indicate the UI changed
    public update() {
        this.emit("update");
    }
}

export class WebPlatformFactory implements IPlatformFactory {
    constructor(private div: HTMLElement) {
    }

    public async create(): Promise<IPlatform> {
        return new WebPlatform(this.div);
    }
}
