/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";
import { ContainerRuntime } from "./containerRuntime";

export interface IStartedResult {
    started: true;
}
export interface INotStartedResult {
    started: false;
    message: string;
}

export class SingleExecutionRunner {
    private everConnected = false;
    private readonly runComplete = new Deferred<void>();

    public constructor(private readonly runtime: ContainerRuntime) {
        // try to determine if the runtime has ever been connected
        if (this.runtime.connected) {
            this.everConnected = true;
        } else {
            this.runtime.once("connected", () => this.everConnected = true);
        }
        this.runtime.on("disconnected", () => {
            // sometimes the initial connection state is raised as disconnected
            if (!this.everConnected) {
                return;
            }
            this.stop();
        });
    }

    public async waitStart(): Promise<IStartedResult | INotStartedResult> {
        if (!this.runtime.connected) {
            if (!this.everConnected) {
                const waitConnected = new Promise((resolve) => this.runtime.once("connected", resolve));
                await Promise.race([waitConnected, this.runComplete.promise]);
                if (!this.runtime.connected) {
                    // if still not connected, no need to start running
                    return {
                        started: false,
                        message: "NeverConnectedBeforeRun",
                    };
                }
            } else {
                // we will not try to reconnect, so we are done running
                return {
                    started: false,
                    message: "DisconnectedBeforeRun",
                };
            }
        }
        return { started: true };
    }

    public waitComplete(): Promise<void> {
        return this.runComplete.promise;
    }

    public stop() {
        this.runComplete.resolve();
    }
}
