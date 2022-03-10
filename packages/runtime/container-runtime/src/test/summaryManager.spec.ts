/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { MockLogger } from "@fluidframework/telemetry-utils";
import {
    IConnectedEvents,
    IConnectedState,
    ISummaryManagerConfig,
    SummaryManager,
    SummaryManagerState,
} from "../summaryManager";
import { Summarizer } from "../summarizer";
import {
    ISummarizer,
    ISummarizerEvents,
    SummarizerStopReason,
} from "../summarizerTypes";
import { ISummarizerClientElection, ISummarizerClientElectionEvents } from "../summarizerClientElection";

describe("Summary Manager", () => {
    let clock: sinon.SinonFakeTimers;
    before(() => { clock = sinon.useFakeTimers(); });
    after(() => clock.restore());
    const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));
    const thisClientId = "this";
    const mockLogger = new MockLogger();
    let summaryManager: SummaryManager;

    // Fake objects
    let fakeOpListener;
    const summaryCollection = {
        opsSinceLastAck: 0,
        addOpListener: (listener) => { fakeOpListener = listener; },
        removeOpListener: (listener) => {
            assert.strictEqual(fakeOpListener, listener, "Re-init of fakeOpListener?");
            fakeOpListener = undefined;
        },
    };
    const throttler = {
        delayMs: 0,
        numAttempts: 0,
        getDelay() { return this.delayMs; },
        maxDelayMs: 0,
        delayWindowMs: 0,
        delayFn: () => 0,
    };

    class TestConnectedState extends TypedEventEmitter<IConnectedEvents> implements IConnectedState {
        public connected = false;
        public clientId: string | undefined;

        public connect() {
            this.connected = true;
            this.clientId = thisClientId;
            this.emit("connected", this.clientId);
        }

        public disconnect() {
            this.connected = false;
            this.emit("disconnected");
        }
    }

    class TestSummarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
        private notImplemented(): never {
            throw Error("not implemented");
        }
        public onBehalfOf: string | undefined;
        public state: "notStarted" | "running" | "stopped" = "notStarted";
        public readonly stopDeferred = new Deferred<string | undefined>();
        public readonly runDeferred = new Deferred<void>();

        constructor() { super(); }
        public async setSummarizer(): Promise<Summarizer> {
            this.notImplemented();
        }
        public get cancelled() {
            // Approximation, as ideally it should become cancelled immediately after stop() call
            return this.state !== "running";
        }
        public stop(reason?: string): void {
            this.stopDeferred.resolve(reason);
        }
        public async run(onBehalfOf: string): Promise<SummarizerStopReason> {
            this.onBehalfOf = onBehalfOf;
            this.state = "running";
            await Promise.all([
                this.stopDeferred.promise,
                this.runDeferred.promise,
            ]);
            this.state = "stopped";
            return "summarizerClientDisconnected";
        }

        public readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"] = () => this.notImplemented();
        public readonly enqueueSummarize: ISummarizer["enqueueSummarize"] = () => this.notImplemented();
        public get IFluidLoadable(): IFluidLoadable { return this.notImplemented(); }
        public get handle(): IFluidHandle { return this.notImplemented(); }
    }

    class TestSummarizerClientElection
        extends TypedEventEmitter<ISummarizerClientElectionEvents>
        implements ISummarizerClientElection {
        public electedClientId: string | undefined;

        public electClient(clientId: string | undefined) {
            this.electedClientId = clientId;
            this.emit("electedSummarizerChanged");
        }
    }

    let clientElection: TestSummarizerClientElection;
    let connectedState: TestConnectedState;
    let summarizer: TestSummarizer;
    let requestCalls = 0;
    let requestDeferred = new Deferred<void>();

    /**
     * Mocks the request Summarizer function by incrementing a call counter.
     * The requestDeferred object must be resolved outside of this function
     * by calling completeSummarizerRequest() before this function will complete.
     * This is used to simulate delaying the request call for testing the
     * SummaryManager state machine timings.
     */
    const requestSummarizer = async (): Promise<ISummarizer> => {
        summarizer = new TestSummarizer();
        requestCalls++;
        requestDeferred = new Deferred();
        await requestDeferred.promise;
        return summarizer;
    };

    /** Completes the pending request Summarizer call. */
    const completeSummarizerRequest = () => requestDeferred.resolve();

    function createSummaryManager({
        connected = false,
        ...config
    }: Readonly<Partial<{ connected?: boolean; } & ISummaryManagerConfig>> = {}) {
        connectedState = new TestConnectedState();
        if (connected) {
            connectedState.connect();
        }
        clientElection = new TestSummarizerClientElection();
        summaryManager = new SummaryManager(
            clientElection,
            connectedState,
            summaryCollection,
            mockLogger,
            requestSummarizer,
            throttler,
            config,
        );
        summaryManager.start();
    }

    function assertState(expectedState: SummaryManagerState, message: string) {
        assert.strictEqual(summaryManager.currentState, expectedState, message);
    }

    function assertRequests(count: number, message?: string) {
        const prefix = message ? `${message} - ` : "";
        assert.strictEqual(requestCalls, count, `${prefix}Unexpected request count`);
    }

    afterEach(() => {
        clientElection.removeAllListeners();
        summarizer.removeAllListeners();
        connectedState.removeAllListeners();
        throttler.delayMs = 0;
        summaryCollection.opsSinceLastAck = 0;
        requestCalls = 0;
        clock.reset();
    });

    it("Should become summarizer if connected, then elected; stop summarizer after disconnect", async () => {
        createSummaryManager({ opsToBypassInitialDelay: 0 });
        assertState(SummaryManagerState.Off, "should start off");
        connectedState.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet elected");
        clientElection.electClient("other");
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but other client elected");
        clientElection.electClient(thisClientId);
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, "should have requested summarizer");
        completeSummarizerRequest();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        connectedState.disconnect();
        await flushPromises();
        assertState(SummaryManagerState.Stopping, "should be stopping after disconnect");
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Off, "should be off after summarizer finishes running");
        assertRequests(1, "should not have requested summarizer again");
    });

    it("Should become summarizer if elected, then connected; stop summarizer after unelected", async () => {
        createSummaryManager({ opsToBypassInitialDelay: 0, initialDelayMs: 0 });
        assertState(SummaryManagerState.Off, "should start off");
        clientElection.electClient(thisClientId);
        await flushPromises();
        assertState(SummaryManagerState.Off, "elected but not yet connected");
        connectedState.connect();
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, "should have requested summarizer");
        completeSummarizerRequest();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        clientElection.electClient("other");
        await flushPromises();
        assertState(SummaryManagerState.Stopping, "should be stopping after other client elected");
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Off, "should be off after summarizer finishes running");
        assertRequests(1, "should not have requested summarizer again");
    });

    it("Should restart if summarizer closes itself", async () => {
        createSummaryManager({ opsToBypassInitialDelay: 0 });
        assertState(SummaryManagerState.Off, "should start off");
        connectedState.connect();
        await flushPromises();
        assertState(SummaryManagerState.Off, "connected but not yet elected");
        clientElection.electClient(thisClientId);
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should request summarizer");
        assertRequests(1, "should have requested summarizer");
        completeSummarizerRequest();
        await flushPromises();
        assertState(SummaryManagerState.Running, "summarizer should be running");
        summarizer.stop(); // Simulate summarizer stopping itself
        summarizer.runDeferred.resolve();
        await flushPromises();
        assertState(SummaryManagerState.Starting, "should restart itself");
        assertRequests(2, "should have requested a new summarizer");
        completeSummarizerRequest();
        await flushPromises();
        assertState(SummaryManagerState.Running, "should be running new summarizer");
    });

    describe("Start Summarizer Delay", () => {
        it("Should wait for initial delay before first start", async () => {
            summaryCollection.opsSinceLastAck = 999; // 999 < 1000, so do not bypass
            createSummaryManager({
                initialDelayMs: 2000,
                opsToBypassInitialDelay: 1000,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            clock.tick(1999);
            await flushPromises();
            assertRequests(0, "should not have requested summarizer yet");
            clock.tick(1);
            await flushPromises();
            assertRequests(1, "should request summarizer after initial delay");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });

        it("Should bypass initial delay if enough ops have already passed", async () => {
            summaryCollection.opsSinceLastAck = 1000; // 1000 >= 1000, so bypass
            createSummaryManager({
                initialDelayMs: 2000,
                opsToBypassInitialDelay: 1000,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            assertRequests(1, "should request summarizer immediately, bypassing initial delay");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });

        // This test attempts to validate a case where summarizer client does not wait
        // initial delay if there are enough unsummarized ops.
        // The way it was implemented (and tested here) is that it only worked if given
        // client was selected to be a summarizer in the past, then got disconnected and later
        // again was elected a summarizer and at that moment we had enough ops to cut short wait.
        // If we want to cut short such wait, we should do it properly by listening for incoming ops
        // and cut wait short based on op count when a single op triggers overflow, i.e.
        // make it work in main scenario, not some corner case that does not matter.
        // Issue #7273 tracks making appropriate product and test change and re-enable the test.
        it("Should bypass initial delay if enough ops pass later", async () => {
            summaryCollection.opsSinceLastAck = 500; // 500 < 1000, so do not bypass yet
            createSummaryManager({
                initialDelayMs: 2000,
                opsToBypassInitialDelay: 1000,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            clock.tick(1999);
            await flushPromises();
            assertRequests(0, "should not have requested summarizer yet");
            summaryCollection.opsSinceLastAck = 999; // 999 < 1000, still do not bypass
            fakeOpListener(); // Fire a fake "op" event
            clientElection.electClient(thisClientId); // force trigger refresh
            await flushPromises();
            assertRequests(0, "still should not have requested summarizer yet");
            summaryCollection.opsSinceLastAck = 1000; // 1000 >= 1000, so should bypass now
            fakeOpListener();  // Fire a fake "op" event
            clientElection.electClient(thisClientId); // force trigger refresh
            await flushPromises();
            assertRequests(1, "should request summarizer, bypassing initial delay");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });

        it("Should wait for throttler delay before starting summarizer", async () => {
            throttler.delayMs = 100;
            createSummaryManager({
                opsToBypassInitialDelay: 0,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            clock.tick(99);
            await flushPromises();
            assertRequests(0, "should not have requested summarizer yet");
            clock.tick(1);
            await flushPromises();
            assertRequests(1, "should request summarizer after throttler delay");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });

        it("Should wait for longer delay (initial) before starting summarizer", async () => {
            throttler.delayMs = 100;
            createSummaryManager({
                initialDelayMs: 2000,
                opsToBypassInitialDelay: 1000,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            clock.tick(1999);
            await flushPromises();
            assertRequests(0, "should not have requested summarizer yet");
            clock.tick(1);
            await flushPromises();
            assertRequests(1, "should request summarizer after both delays");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });

        it("Should wait for longer delay (throttler) before starting summarizer", async () => {
            throttler.delayMs = 100;
            createSummaryManager({
                initialDelayMs: 50,
                opsToBypassInitialDelay: 1000,
                connected: true,
            });
            clientElection.electClient(thisClientId);
            await flushPromises();
            assertState(SummaryManagerState.Starting, "should enter starting state immediately");
            clock.tick(99);
            await flushPromises();
            assertRequests(0, "should not have requested summarizer yet");
            clock.tick(1);
            await flushPromises();
            assertRequests(1, "should request summarizer after both delays");
            completeSummarizerRequest();
            await flushPromises();
            assertState(SummaryManagerState.Running, "summarizer should be running");
        });
    });
});
