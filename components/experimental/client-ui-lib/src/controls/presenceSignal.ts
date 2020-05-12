/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IInboundSignalMessage } from "@microsoft/fluid-runtime-definitions";

const presenceKey = "presence";

export class PresenceSignal extends EventEmitter {
    constructor(private readonly runtime: IComponentRuntime) {
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
