/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/datastore-definitions";
export declare class ChannelDeltaConnection implements IDeltaConnection {
    objectId: string;
    private _connected;
    private readonly submitFn;
    private readonly dirtyFn;
    private _handler;
    private get handler();
    get connected(): boolean;
    constructor(objectId: string, _connected: boolean, submitFn: (message: IDocumentMessage, localOpMetadata: unknown) => void, dirtyFn: () => void);
    attach(handler: IDeltaHandler): void;
    setConnectionState(connected: boolean): void;
    process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;
    reSubmit(content: any, localOpMetadata: unknown): void;
    /**
     * Send new messages to the server
     */
    submit(message: IDocumentMessage, localOpMetadata: unknown): void;
    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a SharedSummaryBlock
     * that needs to be part of the summary but does not generate ops.
     */
    dirty(): void;
}
//# sourceMappingURL=channelDeltaConnection.d.ts.map