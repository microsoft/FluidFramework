/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ChildProcess, fork } from "child_process";
import { Deferred } from "@fluidframework/common-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { IIncomingMessage as IOutgoingChildMessage, IOutgoingMessage as IIncomingChildMessage } from "./childLoader";
import { IKeyValue, IKeyValueWrapper } from "./definitions";

export class KeyValueWrapper implements IKeyValueWrapper {
    private readonly kvDeferred = new Deferred<void>();
    private readonly keyValue: ChildProcess;

    constructor(config: Provider) {
        const keyValueLoaderFile = `${__dirname}/childLoader.js`;
        winston.info(`Forking ${keyValueLoaderFile}`);
        this.keyValue = fork(keyValueLoaderFile);
        const outgoingMessage: IOutgoingChildMessage = {
            param: {
                documentUrl: config.get("keyValue:documentUrl"),
                gatewayKey: config.get("keyValue:jwtKey"),
                gatewayUrl: config.get("keyValue:gatewayUrl"),
            },
            type: "init",
        };
        this.keyValue.once("message", (message: IIncomingChildMessage) => {
            if (message.type === "init") {
                message.status ? this.kvDeferred.resolve() : this.kvDeferred.reject(message.value);
            }
        });
        this.keyValue.send(outgoingMessage);
    }

    public async getKeyValues(): Promise<IKeyValue[]> {
        return new Promise<IKeyValue[]>((resolve, reject) => {
            this.kvDeferred.promise.then(() => {
                const outgoingMessage: IOutgoingChildMessage = {
                    param: undefined,
                    type: "get",
                };
                this.keyValue.once("message", (message: IIncomingChildMessage) => {
                    if (message.type === "get") {
                        message.status ? resolve(message.value as IKeyValue[]) : reject(message.status);
                    }
                });
                this.keyValue.send(outgoingMessage);
            }, (err) => {
                reject(err);
            });
        });
    }

    public async addKeyValue(keyValue: IKeyValue): Promise<IKeyValue> {
        return new Promise<IKeyValue>((resolve, reject) => {
            this.kvDeferred.promise.then(() => {
                const outgoingMessage: IOutgoingChildMessage = {
                    param: keyValue,
                    type: "set",
                };
                this.keyValue.once("message", (message: IIncomingChildMessage) => {
                    if (message.type === "set") {
                        message.status ? resolve(message.value as IKeyValue) : reject(message.status);
                    }
                });
                this.keyValue.send(outgoingMessage);
            }, (err) => {
                reject(err);
            });
        });
    }

    public async removeKeyValue(key: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.kvDeferred.promise.then(() => {
                const outgoingMessage: IOutgoingChildMessage = {
                    param: key,
                    type: "delete",
                };
                this.keyValue.once("message", (message: IIncomingChildMessage) => {
                    if (message.type === "delete") {
                        message.status ? resolve(message.value as string) : reject(message.status);
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
    public async getKeyValues(): Promise<IKeyValue[]> {
        return [];
    }

    public async addKeyValue(keyValue: IKeyValue): Promise<IKeyValue> {
        return undefined;
    }

    public async removeKeyValue(key: string): Promise<string> {
        return undefined;
    }
}
