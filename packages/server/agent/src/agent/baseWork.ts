/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluid-internal/client-api";
import { IHost } from "@microsoft/fluid-container-definitions";
import { Browser, IDocumentServiceFactory } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";
import { parse } from "url";
import { debug } from "./debug";
import { IDocumentTaskInfo } from "./definitions";

export class BaseWork extends EventEmitter {

    protected document: api.Document;
    protected config: any;
    protected task: string;

    protected opHandler: (...args: any[]) => void;
    private errorHandler: (...args: any[]) => void;
    private leaveHandler: (...args: any[]) => void;

    private events = new EventEmitter();
    private readonlyMode = false;
    private url: string;

    constructor(
        alfred: string,
        private documentId: string,
        private tenantId: string,
        private host: IHost,
        private conf: any) {
        super();
        this.config = this.conf;
        // tslint:disable-next-line:max-line-length
        this.url = `fluid://${parse(alfred).host}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.documentId)}`;
    }

    public async loadDocument(
        options: any,
        service: IDocumentServiceFactory,
        task: string): Promise<void> {
        this.task = task;

        this.document = await api.load(this.url, this.host, options, service);

        await this.waitForFullConnection();
        this.attachPostListeners();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded.
        if (this.document !== undefined) {
            // For read only mode, just close the document. Otherwise wait for ops to acked first.
            if (this.readonlyMode) {
                this.closeDocument();
            } else {
                this.closeDocument();
            }
        }
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    protected async start(task: string): Promise<void> {
        // Allows derived class to implement their own start.
    }

    private attachPostListeners() {
        // Emits document relared errors to caller.
        this.errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", this.errorHandler);

        // On a self client leave, mark yourself as readonly and request stop.
        // Otherwise check leader.
        this.leaveHandler = async (clientId: string) => {
            if (this.document.clientId === clientId) {
                this.readonlyMode = true;
                this.requestStop();
            } else {
                if (this.noLeader()) {
                    this.requestStop();
                }
            }
        };
        this.document.runtime.getQuorum().on("removeMember", this.leaveHandler);
    }

    private closeDocument() {
        debug(`Closing document ${this.tenantId}/${this.documentId} for task ${this.task}`);

        // Remove all listeners from the document.
        this.document.removeAllListeners();

        // Close the document.
        this.document.close();

    }

    // Emits a stop request message to the caller.
    private requestStop() {
        const stopEvent: IDocumentTaskInfo = {
            docId: this.documentId,
            task: this.task,
            tenantId: this.tenantId,
        };
        this.events.emit("stop", stopEvent);
    }

    // A leader is any browser client connected to the document.
    private noLeader(): boolean {
        for (const client of this.document.getClients()) {
            if (!client[1].client || !client[1].client.type || client[1].client.type === Browser) {
                return false;
            }
        }
        return true;
    }

    // Wait for the runtime to get fully connected.
    private waitForFullConnection(): Promise<void> {
        if (this.document.isConnected) {
            return;
        } else {
            return new Promise<void>((resolve, reject) => {
                this.document.once("connected", () => {
                    resolve();
                });
            });
        }
    }
}
