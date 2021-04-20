/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ChildProcess, fork } from "child_process";
import { Deferred } from "@fluidframework/common-utils";
import { Provider } from "nconf";
import winston from "winston";
import { IIncomingMessage as IOutgoingChildMessage, IOutgoingMessage as IIncomingChildMessage } from "./childLoader";
import { IKeyValueWrapper } from "./interfaces";

export class KeyValueWrapper implements IKeyValueWrapper {
    private readonly kvDeferred = new Deferred<void>();
    private readonly keyValue: ChildProcess;

    constructor(config: Provider) {
        const keyValueLoaderFile = `${__dirname}/childLoader.js`;
        winston.info(`Forking ${keyValueLoaderFile}`);
        this.keyValue = fork(keyValueLoaderFile);
        const outgoingMessage: IOutgoingChildMessage = {
            type: "init",
            param: {
                documentUrl: config.get("keyValue:documentUrl"),
                gatewayKey: config.get("gateway:key"),
                gatewayUrl: config.get("worker:gatewayUrl"),
            },
        };
        this.keyValue.once("message", (message: IIncomingChildMessage) => {
            if (message.type === "init") {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                message.status ? this.kvDeferred.resolve() : this.kvDeferred.reject(message.value);
            }
        });
        this.keyValue.send(outgoingMessage);
    }

    public async get(key: string) {
        return new Promise<any>((resolve, reject) => {
            this.kvDeferred.promise.then(() => {
                const outgoingMessage: IOutgoingChildMessage = {
                    type: "get",
                    param: key,
                };
                this.keyValue.once("message", (message: IIncomingChildMessage) => {
                    if (message.type === "get") {
                        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                        message.status ? resolve(message.value) : reject(message.status);
                    }
                });
                this.keyValue.send(outgoingMessage);
            }, (err) => {
                reject(err);
            });
        });
    }
}

export class LocalKeyValueWrapper implements IKeyValueWrapper {
    public async get(key: string) {
        return;
    }
}
