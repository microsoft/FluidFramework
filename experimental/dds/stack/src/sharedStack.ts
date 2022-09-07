/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IChannel, IChannelAttributes, IChannelFactory, IChannelServices, IChannelStorageService, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ITelemetryContext, ISummaryTreeWithStats, IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";

/**
 * Events useful for testing and debugging a {@link SharedStack}
 */
export interface DiagnosticEvents extends IEvent {
    (event: "downloadedBlob", handler: () => void);
    (event: "uploadedBlob", handler: () => void);
    (event: "processedOp", handler: () => void);
}

/**
 * A stack DDS which stores every element in its own attachment blob.
 */
export class SharedStack<T = unknown> extends SharedObject<DiagnosticEvents> {
    private head?: IFluidHandle<ArrayBufferLike>;

    /** Construct a new SharedStack */
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string
    ) {
        super(id, runtime, attributes, telemetryContextPrefix);
    }

    /** True iff there are no elements pushed to this stack */
    public isEmpty(): boolean {
        return this.head === undefined;
    }

    /** Download, remove and return the top element on this stack */
    public async pop(): Promise<T> {
        if (this.head === undefined) {
            throw new Error("SharedStack is empty");
        }

        const head = await get<Node<T>>(this.head, this.serializer);
        this.emit("downloadedBlob");
        this.setHead(head.next);
        return head.content;
    }

    /** Upload a new element and add it to the top of the stack */
    public async push(content: T): Promise<void> {
        const head: Node<T> = {
            content,
            next: this.head
        };

        this.setHead(await this.uploadNode(head));
    }

    protected summarizeCore(serializer: IFluidSerializer, telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        if (this.head !== undefined) {
            builder.addBlob("head", serializer.stringify(this.head, this.handle));
        }
        return builder.getSummaryTree();
    }

    protected async loadCore(services: IChannelStorageService): Promise<void> {
        if (await services.contains("head")) {
            const string = IsoBuffer.from(await services.readBlob("head")).toString();
            this.head = this.serializer.parse(string);
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        const serializedHead = message.contents as string | null;
        this.head = serializedHead === null ? undefined : this.serializer.parse(serializedHead);
        this.emit("processedOp");
    }

    public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
        // TODO:#1475: Implement GC as best as currently possible
        return super.getGCData(fullGC);
    }

    protected onDisconnect() {}

    protected applyStashedOp(content: any): unknown {
        return;
    }

    private setHead(head: IFluidHandle<ArrayBufferLike> | undefined): IFluidHandle<ArrayBufferLike> | undefined {
        this.head = head;
        const serializedHead = this.serializer.stringify(head, this.handle) ?? null;
        this.submitLocalMessage(serializedHead);
        return head;
    }

    private async uploadNode(node: Node<T>): Promise<IFluidHandle<ArrayBufferLike>> {
        const string = this.serializer.stringify(this.serializer.encode(node, this.handle), this.handle);
        const buffer = IsoBuffer.from(string);
        const handle = await this.runtime.uploadBlob(buffer);
        this.emit("uploadedBlob");
        return handle;
    }
}

/**
 * A channel factory that creates {@link SharedTree}s.
 */
 export class SharedStackFactory implements IChannelFactory {
    public type: string = "SharedStack";

    public attributes: IChannelAttributes = {
        type: this.type,
        snapshotFormatVersion: "0.0.0",
        packageVersion: "0.0.0",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        // TODO: What should the telemetry context be here?
        const tree = new SharedStack(id, runtime, channelAttributes, this.type);
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
        // TODO: What should the telemetry context be here?
        const tree = new SharedStack(id, runtime, this.attributes, this.type);
        tree.initializeLocal();
        return tree;
    }
}

/** The in-memory (i.e. not serialized) representation of a node in a `SharedStack` */
interface Node<T> {
    content: T,
    next?: IFluidHandle<ArrayBufferLike>
}

/** Download and parse a handle to an attachment blob as the given type */
async function get<T>(handle: IFluidHandle<ArrayBufferLike>, serializer?: IFluidSerializer): Promise<T> {
    const buffer = await handle.get();
    const string = IsoBuffer.from(buffer).toString();
    if (serializer !== undefined) {
        return serializer.parse(string);
    }

    return JSON.parse(string) as T;
}
