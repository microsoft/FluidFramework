/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IDeltaManager,
    IGenericBlob,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import {
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { IInboundSignalMessage, IProvideComponentRegistry } from "@microsoft/fluid-runtime-definitions";
import { IChannel } from ".";

/**
 * Represents the runtime for the component. Contains helper functions/state of the component.
 */
export interface IComponentRuntime extends EventEmitter, IDisposable, Partial<IProvideComponentRegistry> {

    readonly id: string;

    readonly IComponentSerializer: IComponentSerializer;

    readonly IComponentHandleContext: IComponentHandleContext;

    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string | undefined;

    readonly documentId: string;

    readonly existing: boolean;

    readonly parentBranch: string | null;

    readonly connected: boolean;

    readonly loader: ILoader;

    readonly logger: ITelemetryLogger;

    /**
     * Returns if the runtime is attached.
     */
    isAttached: boolean;

    on(event: "disconnected" | "dispose" | "leader" | "notleader", listener: () => void): this;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void): this;
    on(event: "connected", listener: (clientId: string) => void): this;

    /**
     * Returns the channel with the given id
     */
    getChannel(id: string): Promise<IChannel>;

    /**
     * Creates a new channel of the given type.
     * @param id - ID of the channel to be created.  A unique ID will be generated if left undefined.
     * @param type - Type of the channel.
     */
    createChannel(id: string | undefined, type: string): IChannel;

    /**
     * Registers the channel with the component runtime. If the runtime
     * is collaborative then we attach the channel to make it collaborative.
     */
    registerChannel(channel: IChannel): void;

    /**
     * Api for generating the snapshot of the component.
     * @param message - Message for the snapshot.
     */
    snapshot(message: string): Promise<void>;

    /**
     * Triggers a message to force a snapshot
     */
    save(message: string);

    // Blob related calls
    /**
     * Api to upload a blob of data.
     * @param file - blob to be uploaded.
     */
    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
     * Api to get the blob for a particular id.
     * @param blobId - ID of the required blob.
     */
    getBlob(blobId: string): Promise<IGenericBlob | undefined>;

    /**
     * Api to get the blob metadata.
     */
    getBlobMetadata(): Promise<IGenericBlob[]>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Called by distributed data structures in disconnected state to notify about pending local changes.
     * All pending changes are automatically flushed by shared objects on connection.
     */
    notifyPendingMessages(): void;

    /**
     * Resolves when a local component is attached.
     */
    waitAttached(): Promise<void>;

    /**
     * Errors raised by distributed data structures
     */
    error(err: any): void;

    /**
     * It is false if the container is attached to storage and the component is attached to container.
     */
    isLocal(): boolean;
}
