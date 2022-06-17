/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";
import { AttachState, IAudience, IContainer, IContainerEvents, IDeltaManager, IDeltaManagerEvents, ReadOnlyInfo } from "@fluidframework/container-definitions";
import { sessionStorageConfigProvider } from "@fluidframework/telemetry-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, IDocumentMessage } from "@fluidframework/protocol-definitions";
import { waitContainerToCatchUp } from "../container";
// import { Loader } from "../loader";
// import { IConnectionStateHandlerInputs } from "../connectionStateHandler";
// import { CatchUpMonitor, ImmediateCatchUpMonitor } from "../catchUpMonitor";
import { ConnectionState } from "../connectionState";

class MockDeltaManager
    extends TypedEventEmitter<IDeltaManagerEvents>
    implements Partial<Omit<IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>, "on" | "off" | "once">> {
//
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

    resume() {
        this.connectionState = ConnectionState.Connected;
        this.emit("connected");
    }
}

describe("Container", () => {
    describe("constructor", () => {
        const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
        let injectedSettings = {};

        before(() => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            sessionStorageConfigProvider.value.getRawConfig = (name) => injectedSettings[name];
        });

        afterEach(() => {
            injectedSettings = {};
        });

        after(() => {
            sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
        });

        //* SKIP
        // it.skip("Fluid.Container.CatchUpBeforeDeclaringConnected = true, use CatchUpMonitor", () => {
        //     injectedSettings["Fluid.Container.CatchUpBeforeDeclaringConnected"] = true;

        //     //* Never going to work. Need a legit connection to be able to create the CatchUpMonitor
        //     const container = new Container({ services: { options: {} } } as Loader, {});
        //     container.connect();

        //     const connectionStateHandlerArgs = (container as any).connectionStateHandler.handler as IConnectionStateHandler;
        //     const catchUpMonitor = connectionStateHandlerArgs.createCatchUpMonitor();
        //     assert(catchUpMonitor instanceof CatchUpMonitor);
        // });

        // it("Fluid.Container.CatchUpBeforeDeclaringConnected undefined, use ImmediateCatchUpMonitor", () => {
        //     const container = new Container({ services: { options: {} } } as Loader, {});
        //     const connectionStateHandlerArgs = (container as any).connectionStateHandler.handler as IConnectionStateHandler;
        //     const catchUpMonitor = connectionStateHandlerArgs.createCatchUpMonitor();
        //     assert(catchUpMonitor instanceof ImmediateCatchUpMonitor);
        // });

        // it("Fluid.Container.CatchUpBeforeDeclaringConnected only read on construction", () => {
        //     const container = new Container({ services: { options: {} } } as Loader, {});

        //     // This should not change anything since Container constructor has already been called
        //     injectedSettings["Fluid.Container.CatchUpBeforeDeclaringConnected"] = true;

        //     const connectionStateHandlerArgs = (container as any).connectionStateHandler.handler as IConnectionStateHandler;
        //     const catchUpMonitor = connectionStateHandlerArgs.createCatchUpMonitor();
        //     assert(catchUpMonitor instanceof ImmediateCatchUpMonitor);
        // });
    });

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

        it("Disconnected Container gets Connected then waits for catching up", async () => {
            const mockContainer = new MockContainer();
            mockContainer.connectionState = ConnectionState.Disconnected;

            const waitP = waitContainerToCatchUp(mockContainer as any as IContainer);
            mockContainer.mockDeltaManager.emit("op", { sequenceNumber: 2 });

            // Should resolve immediately, otherwise test will time out
            await waitP;
        });
    });
});
