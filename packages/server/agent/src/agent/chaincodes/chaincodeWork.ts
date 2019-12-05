/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IHost,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";
import { EventEmitter } from "events";
import { parse } from "url";
import { debug } from "../debug";
import { IDocumentTaskInfo } from "../definitions";

export class ChaincodeWork extends EventEmitter {

    protected document: Container;

    private events = new EventEmitter();
    private task: string;

    constructor(
        private readonly alfred: string,
        private readonly docId: string,
        private readonly tenantId: string,
        private readonly host: IHost,
        private readonly serviceFactory: IDocumentServiceFactory,
        private readonly codeLoader: ICodeLoader,
        workType: string) {
            super();
            this.task = workType;
    }

    public async loadChaincode(options: any, attachPlatform: boolean): Promise<void> {
        const loader = new Loader(
            this.host,
            this.serviceFactory,
            this.codeLoader,
            options,
            {},
            new Map<string, IProxyLoaderFactory>());

        const url =
            `fluid://${parse(this.alfred).host}/` +
            `${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.docId)}`;
        this.document = await loader.resolve({ url });

        if (attachPlatform) {
            this.attachListeners();
        }

        // Wait to be fully connected!
        if (!this.document.connected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded.
        if (this.document !== undefined) {
            // Remove all listeners and close the document.
            this.document.removeAllListeners();
            this.document.close();
            debug(`Closed document ${this.tenantId}/${this.docId} for task ${this.task}`);
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    private attachListeners() {
        // Emits document related errors to caller.
        const errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", errorHandler);

        const leaveHandler = (clientId: string) => {
            if (this.document.clientId === clientId) {
                this.requestStop();
            } else {
                if (this.noLeader()) {
                    this.requestStop();
                }
            }
        };
        this.document.getQuorum().on("removeMember", leaveHandler);
    }

    // Emits a stop request message to the caller. The caller will then
    // call stop() to stop the task on the document.
    private requestStop() {
        const stopEvent: IDocumentTaskInfo = {
            docId: this.docId,
            task: this.task,
            tenantId: this.tenantId,
        };
        this.events.emit("stop", stopEvent);
    }

    // A leader is any browser client connected to the document at this moment.
    // The leader election makes sure that the session has a leader as long as there is
    // a browser client connected.
    private noLeader(): boolean {
        for (const client of this.document.getQuorum().getMembers()) {
            if (
                !client[1].client || (
                    // back-compat: 0.11 clientType
                    !client[1].client.details && (
                        !client[1].client.type
                        || client[1].client.type === "browser"
                    )
                ) || (
                    client[1].client.details
                    && client[1].client.details.capabilities.interactive
                )
            ) {
                return false;
            }
        }
        return true;
    }
}
