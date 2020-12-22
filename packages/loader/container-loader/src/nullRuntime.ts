/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IFluidHandleContext,
    IFluidSerializer,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
    AttachState,
} from "@fluidframework/container-definitions";
import {
    ISequencedDocumentMessage,
    ISummaryTree,
    ITree,
    SummaryType,
} from "@fluidframework/protocol-definitions";

export class NullRuntime extends EventEmitter implements IRuntime {
    public get IFluidSerializer(): IFluidSerializer {
        throw new Error("Not implemented");
    }

    public get IFluidHandleContext(): IFluidHandleContext {
        throw new Error("Not implemented");
    }

    public ready: Promise<void> | undefined;

    private _disposed = false;
    public get disposed() { return this._disposed; }

    constructor() {
        super();
    }

    public dispose(): void {
        this._disposed = true;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public snapshot(tagMessage: string): Promise<ITree | null> {
        return Promise.resolve(null);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public summarize(fullTree: boolean = false): Promise<ISummaryTree> {
        return Promise.resolve({
            tree: {},
            type: SummaryType.Tree,
        });
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public stop(): Promise<IRuntimeState> {
        return Promise.resolve({});
    }

    public createSummary(): ISummaryTree {
        return {
            tree: {},
            type: SummaryType.Tree,
        };
    }

    public setAttachState(attachState: AttachState.Attaching | AttachState.Attached) {
        throw new Error("Null Runtime should not be attached");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: null };
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        throw new Error("Null runtime should not receive messages");
    }

    public processSignal(message: any, local: boolean) {
        // Null runtime can receive signals but it's okay to miss those.
        return;
    }

    public getPendingLocalState() {
        return;
    }
}

export class NullChaincode implements IRuntimeFactory {
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return new NullRuntime();
    }

    public get IRuntimeFactory() { return this; }
}
