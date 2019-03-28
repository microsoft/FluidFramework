import { ISignalMessage } from "@prague/container-definitions";
import { IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

const presenceKey = "presence";

export class PresenceSignal extends EventEmitter {
    constructor(private runtime: IRuntime) {
        super();
        this.listenForPresence();
    }

    public submitPresence(content: any) {
        this.runtime.submitSignal(presenceKey, content);
    }

    private listenForPresence() {
        this.runtime.on("signal", (message: ISignalMessage, local: boolean) => {
            if (message.content.type === presenceKey) {
                // Copy over nested content.
                message.content = message.content.content;
                this.emit("message", message, local);
            }
        });
    }
}
