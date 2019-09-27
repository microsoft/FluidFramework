/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandleContext,
    IComponentSerializer,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ConnectionState,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@microsoft/fluid-container-definitions";
import {
    ISequencedDocumentMessage,
    ISummaryTree,
    ITree,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

class NullRuntime extends EventEmitter implements IRuntime {
    public get IComponentSerializer(): IComponentSerializer {
        throw new Error("Not implemented");
    }

    public get IComponentHandleContext(): IComponentHandleContext {
        throw new Error("Not implemented");
    }

    public ready: Promise<void> | undefined;

    constructor() {
        super();
    }

    public snapshot(tagMessage: string): Promise<ITree | null> {
        return Promise.resolve(null);
    }

    public summarize(fullTree: boolean = false): Promise<ISummaryTree> {
        return Promise.resolve({
            tree: {},
            type: SummaryType.Tree,
        });
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        return;
    }

    public stop(): Promise<void> {
        return Promise.resolve();
    }

    public request(request: IRequest): Promise<IResponse> {
        return Promise.resolve({ status: 404, mimeType: "text/plain", value: null });
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        throw new Error("Null runtime should not receive messages");
    }

    public processSignal(message: any, local: boolean) {
        // Null runtime can receive signals but it's okay to miss those.
        return;
    }
}

export class NullChaincode implements IRuntimeFactory {

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return new NullRuntime();
    }

    public get IRuntimeFactory() { return this; }
}
