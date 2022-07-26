/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { IDeltaManager, IDeltaManagerEvents } from "@fluidframework/container-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { CatchUpMonitor, ImmediateCatchUpMonitor } from "../catchUpMonitor";

class MockDeltaManagerForCatchingUp
    extends TypedEventEmitter<IDeltaManagerEvents>
    implements Pick<IDeltaManager<any, any>, "lastSequenceNumber" | "lastKnownSeqNumber">
{ // eslint-disable-line @typescript-eslint/brace-style
    constructor(
        public lastSequenceNumber: number = 5,
        public lastKnownSeqNumber: number = 10,
    ) {
        super();
    }

    /** Simulate processing op with the given sequence number, to trigger CatchUpMonitor */
    emitOpWithSequenceNumber(sequenceNumber: number) {
        this.emit("op", { sequenceNumber });
    }

    /** Trigger the CatchUpMonitor by emitting op with the target sequence number */
    emitOpToCatchUp() {
        this.emitOpWithSequenceNumber(this.lastKnownSeqNumber);
    }

    static create(sequenceNumbers: {
        lastSequenceNumber?: number;
        lastKnownSeqNumber?: number;
    } = {}): MockDeltaManagerForCatchingUp & IDeltaManager<any, any> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return new MockDeltaManagerForCatchingUp(
            sequenceNumbers.lastSequenceNumber,
            sequenceNumbers.lastKnownSeqNumber,
        ) as any;
    }
}

describe("CatchUpMonitor", () => {
    let monitor: CatchUpMonitor;

    afterEach(() => {
        monitor?.dispose();
    });

    it("constructor validates DeltaManager sequence number coherency", async () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create({
            lastSequenceNumber: 20,
            lastKnownSeqNumber: 15, // Should be impossible in real world
        });

        assert.throws(() => new CatchUpMonitor(mockDeltaManager), "Expect assert when DeltaManager in invalid state");
    });

    it("Emits caughtUp event when caught up to the point it was created", () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create({
            lastSequenceNumber: 10,
            lastKnownSeqNumber: 15,
        });
        let caughtUp = false;

        mockDeltaManager.lastKnownSeqNumber = 20;
        monitor = new CatchUpMonitor(mockDeltaManager);
        mockDeltaManager.lastKnownSeqNumber = 25;  // Shouldn't change anything about the monitor
        monitor.on("caughtUp", () => { caughtUp = true; });

        mockDeltaManager.emitOpWithSequenceNumber(19); // Less than 20
        assert(!caughtUp, "Shouldn't be considered caught up yet");
        mockDeltaManager.emitOpWithSequenceNumber(21); // Greater than 20
        assert(caughtUp, "Should be considered caught up now");
    });

    it("Adding a listener after already caught up invokes the listener immediately", () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create({
            lastSequenceNumber: 10,
            lastKnownSeqNumber: 15,
        });
        let caughtUp = false;

        monitor = new CatchUpMonitor(mockDeltaManager);
        mockDeltaManager.emitOpToCatchUp();

        monitor.on("caughtUp", () => { caughtUp = true; });
        assert(caughtUp, "caughtUp should have fired immediately");
    });

    it("Emits caught up immediately if last known/processed sequence numbers match", () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create({
            lastSequenceNumber: 10,
            lastKnownSeqNumber: 10,
        });
        let caughtUp = false;

        monitor = new CatchUpMonitor(mockDeltaManager);

        monitor.on("caughtUp", () => { caughtUp = true; });
        assert(caughtUp, "caughtUp should have fired immediately");
    });

    it("Only emits caughtUp once", () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create({
            lastSequenceNumber: 10,
            lastKnownSeqNumber: 15,
        });
        let caughtUpCount = 0;

        monitor = new CatchUpMonitor(mockDeltaManager);
        monitor.on("caughtUp", () => { ++caughtUpCount; });

        mockDeltaManager.emitOpWithSequenceNumber(15);
        assert.equal(caughtUpCount, 1, "caughtUp should have fired once");
        mockDeltaManager.emitOpWithSequenceNumber(16);
        assert.equal(caughtUpCount, 1, "caughtUp should have fired only once");

        let secondCaughtUpCount = 0;
        monitor.on("caughtUp", () => { secondCaughtUpCount = 1; });
        assert.equal(secondCaughtUpCount, 1, "New listener should still get invoked once caught up");
        mockDeltaManager.emitOpWithSequenceNumber(17);
        assert.equal(secondCaughtUpCount, 1, "Subsequent ops will not cause caughtUp again on second listener");
    });

    it("Dispose removes all listeners", () => {
        const mockDeltaManager = MockDeltaManagerForCatchingUp.create();
        monitor = new CatchUpMonitor(mockDeltaManager);

        monitor.on("caughtUp", () => {});
        monitor.on("caughtUp", () => {});
        monitor.on("caughtUp", () => {});
        monitor.dispose();

        assert(monitor.disposed, "dispose() should set disposed");
        assert.equal(monitor.listenerCount("caughtUp"), 0, "dispose() should clear all listeners");
        assert.equal(mockDeltaManager.listenerCount("op"), 0, "CatchUpMonitor.dispose should remove listener on DeltaManager");
    });
});

describe("ImmediateCatchUpMonitor", () => {
    it("caughtUp event fires immediately upon adding a listener", () => {
        const monitor = new ImmediateCatchUpMonitor();
        let caughtUp = false;
        monitor.on("caughtUp", () => {
            caughtUp = true;
        });
        assert(caughtUp, "callback should be invoked immediately");
    });

    it("Dispose removes all listeners", () => {
        const monitor = new ImmediateCatchUpMonitor();
        monitor.on("caughtUp", () => {});
        monitor.on("caughtUp", () => {});
        monitor.on("caughtUp", () => {});
        monitor.dispose();

        assert(monitor.disposed, "dispose() should set disposed");
        assert.equal(monitor.listenerCount("caughtUp"), 0, "dispose() should clear all listeners");
    });
});
