/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import { Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerWarning, ILoader } from "@fluidframework/container-definitions";
import { IFluidHandle, IFluidLoadable, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ISequencedClient } from "@fluidframework/protocol-definitions";
import { ISummaryCollectionOpEvents } from "../summaryCollection";
import {
    SummaryManager,
    SummaryManagerConfig,
    SummaryManagerContainerContext,
    SummaryManagerState,
} from "../summaryManager";
import { ISummarizer, ISummarizerEvents, Summarizer } from "../summarizer";
import { summarizerClientType } from "../orderedClientElection";
import { TestQuorum } from "./testQuorum";

describe("Summary Manager", () => {
    const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));
    const thisClientId = "this";
    const quorum = new TestQuorum();
    const mockLogger = new MockLogger();
    const summaryCollection = new TypedEventEmitter<ISummaryCollectionOpEvents>();
    let summaryManager: SummaryManager;

    const constantZeroThrottleFn = () => 0;

    // Fake DeltaManager sequences
    const deltaManager = {
        initialSequenceNumber: 0,
        lastSequenceNumber: 0,
    };

    class TestSummarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
        private notImplemented(): never {
            throw Error("not implemented");
        }
        public onBehalfOf: string | undefined;
        public state: "notStarted" | "running" | "stopped" = "notStarted";
        public readonly stopDeferred = new Deferred<void>();
        public readonly runDeferred = new Deferred<void>();

        constructor() { super(); }
        public async setSummarizer(): Promise<Summarizer> {
            this.notImplemented();
        }
        public stop(reason?: string): void {
            this.stopDeferred.resolve();
        }
        public async run(onBehalfOf: string): Promise<void> {
            this.onBehalfOf = onBehalfOf;
            this.state = "running";
            await Promise.all([
                this.stopDeferred.promise,
                this.runDeferred.promise,
            ]);
            this.state = "stopped";
        }
        public updateOnBehalfOf(onBehalfOf: string): void {
            this.onBehalfOf = onBehalfOf;
        }

        public async request(request: IRequest): Promise<IResponse> {
            this.notImplemented();
        }
        public get IFluidLoadable(): IFluidLoadable { return this.notImplemented(); }
        public get IFluidRouter(): IFluidRouter { return this.notImplemented(); }
        public get handle(): IFluidHandle { return this.notImplemented(); }
    }

    let summarizer: TestSummarizer;
    let requestSequenceNumbers: number[] = [];
    let requestDeferred = new Deferred<void>();
    const requestSummarizer = async (loader: ILoader, sequenceNumber: number): Promise<ISummarizer> => {
        summarizer = new TestSummarizer();
        requestSequenceNumbers.push(sequenceNumber);
        requestDeferred = new Deferred();
        await requestDeferred.promise;
        return summarizer;
    };

    function addClient(clientId: string, sequenceNumber: number, interactive = true) {
        deltaManager.lastSequenceNumber = sequenceNumber;
        const details: ISequencedClient["client"]["details"] = { capabilities: { interactive } };
        const c: Partial<ISequencedClient["client"]> = { details };
        const client: ISequencedClient = { client: c as ISequencedClient["client"], sequenceNumber };
        quorum.addClient(clientId, client);
    }

    function createSummaryManager(config: Partial<SummaryManagerConfig> = {}, connected = false, interactive = true) {
        const context: SummaryManagerContainerContext = {
            clientId: thisClientId,
            connected,
            clientDetails: {
                capabilities: { interactive },
                type: interactive ? undefined : summarizerClientType,
            },
            deltaManager,
            quorum,
            raiseContainerWarning(warning: ContainerWarning): void {
                // do nothing
            },
            loader: {} as unknown as ILoader, // we don't need loader
        };
        summaryManager = new SummaryManager(
            context,
            summaryCollection,
            mockLogger,
            requestSummarizer,
            config,
        );

        return {
            connect() { summaryManager.setConnected(thisClientId); },
            disconnect() { summaryManager.setDisconnected(); },
        };
    }

    function assertState(expectedState: SummaryManagerState, message: string) {
        assert.strictEqual(summaryManager.currentState, expectedState, message);
    }

    function assertRequests(count: number, latestSeq?: number, message?: string) {
        const prefix = message ? `${message} - ` : "";
        assert.strictEqual(requestSequenceNumbers.length, count, `${prefix}Unexpected request count`);
        if (latestSeq !== undefined) {
            assert.strictEqual(
                requestSequenceNumbers[requestSequenceNumbers.length - 1],
                latestSeq,
                `${prefix}Unexpected latest request seq`);
        }
    }

    afterEach(() => {
        quorum.reset();
        summaryCollection.removeAllListeners();
        deltaManager.lastSequenceNumber = 0;
        requestSequenceNumbers = [];
    });

    it("Should become summarizer at normal pace as only client", async () => {
        const connector = createSummaryManager({ opsToBypassInitialDelay: 0 });
        assertState(SummaryManagerState.Off, "should start off");
        connector.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet in quorum");
        addClient(thisClientId, 1);
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, 1, "should have requested summarizer");
        requestDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        connector.disconnect();
        await flushPromises();
        assertState(SummaryManagerState.Stopping, "should be stopping after disconnect");
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Off, "should be off after summarizer finishes running");
    });

    it("Should become summarizer after oldest client leaves", async () => {
        const connector = createSummaryManager({ opsToBypassInitialDelay: 0 });
        addClient("first", 1);
        connector.connect();
        addClient(thisClientId, 2);
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not oldest client");
        assertRequests(0, undefined, "no requests yet");
        deltaManager.lastSequenceNumber = 3;
        quorum.removeClient("first");
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, 3, "should have requested summarizer");
        requestDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        deltaManager.lastSequenceNumber = 4;
        quorum.removeClient(thisClientId);
        await flushPromises();
        assertState(SummaryManagerState.Stopping, "should be stopping after leaving quorum");
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Off, "should be off after summarizer finishes running");
    });

    it("Should never become summarizer if explicitly disabled", async () => {
        const connector = createSummaryManager({ opsToBypassInitialDelay: 0, summariesEnabled: false });
        assertState(SummaryManagerState.Off, "should start off");
        connector.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet in quorum");
        addClient(thisClientId, 1);
        await flushPromises();
        assertState(SummaryManagerState.Disabled, "should realize disabled and lock state");
        requestDeferred.resolve();
        connector.disconnect();
        await flushPromises();
        assertRequests(0, undefined, "never request when disabled");
        assertState(SummaryManagerState.Disabled, "should remain in disabled state forever");
    });

    it("Should never become summarizer if it is a summarizer client", async () => {
        const connector = createSummaryManager({ opsToBypassInitialDelay: 0 }, false, false);
        assertState(SummaryManagerState.Off, "should start off");
        connector.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet in quorum");
        addClient(thisClientId, 1);
        await flushPromises();
        assertState(SummaryManagerState.Disabled, "should realize disabled and lock state");
        requestDeferred.resolve();
        connector.disconnect();
        await flushPromises();
        assertRequests(0, undefined, "never request when disabled");
        assertState(SummaryManagerState.Disabled, "should remain in disabled state forever");
    });

    it("Should restart if summarizer closes itself", async () => {
        const connector = createSummaryManager({ opsToBypassInitialDelay: 0, throttleDelayFn: constantZeroThrottleFn });
        assertState(SummaryManagerState.Off, "should start off");
        connector.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet in quorum");
        addClient(thisClientId, 1);
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, 1, "should have requested summarizer");
        requestDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        deltaManager.lastSequenceNumber = 2;
        // Simulate summarizer stopping itself
        summarizer.stop();
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should restart itself");
        assertRequests(2, 2, "should have requested a new summarizer");
        requestDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Running, "should be running new summarizer");
    });
});
