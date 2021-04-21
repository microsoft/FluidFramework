/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

const presenceKey = "presence";

export class PresenceSignal extends EventEmitter {
    constructor(private readonly runtime: IFluidDataStoreRuntime) {
        super();
        this.listenForPresence();
    }

    public submitPresence(content: any) {
        this.runtime.submitSignal(presenceKey, content);
    }

    private listenForPresence() {
        this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === presenceKey) {
                this.emit("message", message, local);
            }
        });
    }
}
