/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";
import { AttachState, IAudience, IContainer, IContainerEvents, IDeltaManager, IDeltaManagerEvents, IDeltaQueue, ReadOnlyInfo } from "@fluidframework/container-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, IDocumentMessage, IClientConfiguration, IClientDetails, ISignalMessage } from "@fluidframework/protocol-definitions";
import { waitContainerToCatchUp } from "../container";
import { ConnectionState } from "../connectionState";

class MockDeltaManager
    extends TypedEventEmitter<IDeltaManagerEvents>
    implements Partial<Omit<IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>, "on" | "off" | "once">>
{ // eslint-disable-line @typescript-eslint/brace-style
    hasCheckpointSequenceNumber = true;
    lastKnownSeqNumber = 2;
    lastSequenceNumber = 1;
}
class MockDeltaManagerDisconnect
    extends TypedEventEmitter<IDeltaManagerEvents>
    implements Partial<Omit<IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>, "on" | "off" | "once">> {
    inbound?: IDeltaQueue<ISequencedDocumentMessage> | undefined;
    outbound?: IDeltaQueue<IDocumentMessage[]> | undefined;
    inboundSignal?: IDeltaQueue<ISignalMessage> | undefined;
    minimumSequenceNumber?: number | undefined;
    lastMessage?: ISequencedDocumentMessage | undefined;
    initialSequenceNumber?: number | undefined;
    clientDetails?: IClientDetails | undefined;
    version?: string | undefined;
    maxMessageSize?: number | undefined;
    serviceConfiguration?: IClientConfiguration | undefined;
    active?: boolean | undefined;
    readOnlyInfo?: ReadOnlyInfo | undefined;
    submitSignal?(content: any): void {
        throw new Error("Method not implemented.");
    }
    flush?(): void {
        throw new Error("Method not implemented.");
    }
    disposed?: boolean | undefined;
    dispose(error?: Error | undefined): void {
        this.emit("disconnect", "test");
    };
    hasCheckpointSequenceNumber = true;
    lastKnownSeqNumber = 2;
    lastSequenceNumber = 1;
}

class MockContainer extends TypedEventEmitter<IContainerEvents> implements Partial<Omit<IContainer, "on" | "off" | "once">> {
    deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> = new MockDeltaManager() as any;
    resolvedUrl?: IResolvedUrl | undefined;
    attachState?: AttachState | undefined;
    closed?: boolean | undefined = false;
    isDirty?: boolean | undefined;
    connectionState?: ConnectionState | undefined;
    connected?: boolean | undefined;
    audience?: IAudience | undefined;
    clientId?: string | undefined;
    readOnlyInfo?: ReadOnlyInfo | undefined;
    IFluidRouter?: IFluidRouter | undefined;

    get mockDeltaManager() { return this.deltaManager as any as MockDeltaManager; }

    connect() {
        this.connectionState = ConnectionState.Connected;
        this.emit("connected");
    }
}

describe("Container", () => {
    describe("waitContainerToCatchUp", () => {
        it("Closed Container fails", async () => {
            const mockContainer = new MockContainer();
            mockContainer.closed = true;

            await assert.rejects(async () =>
                waitContainerToCatchUp(mockContainer as any as IContainer), "Passing a closed container should throw");
        });

        it("Connected Container waits for catching up", async () => {
            const mockContainer = new MockContainer();
            mockContainer.connectionState = ConnectionState.Connected;

            const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);
            mockContainer.mockDeltaManager.emit("op", { sequenceNumber: 2 });

            // Should resolve immediately, otherwise test will time out
            await waitP;
        });

        it("Connected and caught up Container resolves immediately", async () => {
            const mockContainer = new MockContainer();
            mockContainer.mockDeltaManager.lastSequenceNumber = 2; // to match lastKnownSeqNumber
            mockContainer.connectionState = ConnectionState.Connected;

            const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);

            // Should resolve immediately, otherwise test will time out
            await waitP;
        });

        it.only("it emits a reason", async () => {
            const mockContainer = new MockDeltaManagerDisconnect();
            mockContainer.on("disconnect", console.log);
            mockContainer.dispose();
            await new Promise<void>((resolve, reject) => mockContainer.on("disconnect", resolve));
            mockContainer.on("disconnect", (reason) => console.log(reason));
        });
    });
});
