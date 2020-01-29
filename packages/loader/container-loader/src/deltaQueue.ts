/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { IDeltaQueue } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
import * as Deque from "double-ended-queue";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const performanceNow = require("performance-now") as (() => number);

/**
 * The initial time for processing ops in a single iteration.
 */
const asyncProcessingStartTime = 20;

/**
 * The increase in time allowed for processing ops after each iteration when processing ops
 * asynchronously.
 */
const asyncProcessingTimeIncrease = 10;

/**
 * The number of times ops have been processed asyncronously when there is more than one
 * op in the queue. This is used to log the time taken to process large number of ops.
 * For example, when catching up ops right after boot or catching up ops / delayed reaziling
 * components by summarizer.
 */
let asyncProcessingCount = -1;

export class DeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    private isDisposed: boolean = false;
    private readonly q = new Deque<T>();

    /**
     * Tracks whether the system has requested the queue be paused.
     */
    private sysPause = true;

    /**
     * Tracks whether the user of the container has requested the queue be paused.
     */
    private userPause = false;

    private error: any | undefined;

    /**
     * When processing is ongoing, holds a deferred that will resolve once processing stops.
     * Undefined when not processing.
     */
    private processingDeferred: Deferred<void> | undefined;

    /**
     * When async processing is ongoing, holds a deferred that will resolve once processing stops.
     * Undefined when not processing.
     */
    private processingDeferredAsync: Deferred<void> | undefined;

    private asyncProcessingLog: {
        numberOfOps: number;
        numberOfBatches: number;
        totalProcessingTime: number;
    } | undefined;

    public get disposed(): boolean {
        return this.isDisposed;
    }

    /**
     * @returns True if the queue is paused, false if not.
     */
    public get paused(): boolean {
        // The queue can be paused by either the user or by the system (e.g. during snapshotting).  If either requests
        // a pause, then the queue will pause.
        return this.sysPause || this.userPause;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return !this.processingDeferred && !this.processingDeferredAsync && this.q.length === 0;
    }

    /**
     * @param worker - A callback to process a delta.
     * @param logger - For logging telemetry.
     */
    constructor(
        private readonly worker: (delta: T) => void,
        private readonly logger: ITelemetryLogger,
    ) {
        super();
    }

    public dispose() {
        assert.fail("Not implemented.");
        this.isDisposed = true;
    }

    public clear(): void {
        this.q.clear();
    }

    public peek(): T | undefined {
        return this.q.peekFront();
    }

    public toArray(): T[] {
        return this.q.toArray();
    }

    public push(task: T) {
        this.q.push(task);
        this.emit("push", task);
        this.ensureProcessing();
    }

    public async pause(): Promise<void> {
        this.userPause = true;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        const processingPromise: Promise<void>[] = [];
        if (this.processingDeferred) {
            processingPromise.push(this.processingDeferred.promise);
        }
        if (this.processingDeferredAsync) {
            processingPromise.push(this.processingDeferredAsync.promise);
        }
        await Promise.all(processingPromise);
    }

    public resume(): void {
        this.userPause = false;
        if (!this.paused) {
            this.ensureProcessing(true);
        }
    }

    public async systemPause(): Promise<void> {
        this.sysPause = true;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        const processingPromise: Promise<void>[] = [];
        if (this.processingDeferred) {
            processingPromise.push(this.processingDeferred.promise);
        }
        if (this.processingDeferredAsync) {
            processingPromise.push(this.processingDeferredAsync.promise);
        }
        await Promise.all(processingPromise);
    }

    public systemResume(): void {
        this.sysPause = false;
        if (!this.paused) {
            this.ensureProcessing(true);
        }
    }

    /**
     * There are several actions that may need to kick off delta processing, so we want to guard against
     * accidental reentrancy. ensureProcessing can be called safely to start the processing loop if it is
     * not already started.
     * If processAsync is true, delta processing is done on a separate stack so that the user stack does
     * not become too large.
     */
    private ensureProcessing(processAsync = false) {
        if (processAsync) {
            if (!this.processingDeferred && !this.processingDeferredAsync) {
                // Log telemetry for the time taken to process when there is more than one op in the queue.
                // We want to catch any unexpected behavior when process large amount of ops such as when
                // catching up ops right after boot.
                if (this.q.length > 1) {
                    asyncProcessingCount++;
                    this.asyncProcessingLog = {
                        numberOfOps: this.q.length,
                        numberOfBatches: 0,
                        totalProcessingTime: 0,
                    };
                }
                this.processingDeferredAsync = new Deferred<void>();
                // Use a resolved promise to start the processing on a separate stack.
                // processingDeferredAsync will be resolved in processDeltasAsync once we have asynchronously
                // completed the processing.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                Promise.resolve().then(() => {
                    this.processDeltasAsync();
                });
            }
        } else {
            if (!this.processingDeferred) {
                this.processingDeferred = new Deferred<void>();
                this.processDeltas();
                this.processingDeferred.resolve();
                this.processingDeferred = undefined;
            }
        }
    }

    /**
     * Executes the delta processing loop until a stop condition is reached.
     */
    private processDeltas() {
        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until no messages to process, we have become paused, or hit an error.
        while (!(this.q.length === 0 || this.paused || this.error)) {
            // Get the next message in the queue
            const next = this.q.shift();

            // Process the message.
            try {
                this.worker(next!);
                this.emit("op", next);
            } catch (error) {
                this.error = error;
                this.emit("error", error);
            }
        }
    }

    /**
     * Executes the delta processing loop until a stop condition is reached. It processes
     * ops for an allowed amount of time (asyncProcessingStartTime by default) and then
     * schedules the rest of the ops to be processed aynschronously. This ensures that we
     * don't block the JS threads for a long time (for example, when catching up ops right
     * after boot or catching up ops / delayed reaziling components by summarizer).
     *
     * We increase the allowed processing time in each iteration until all the ops have been
     * processed. This way we keep the responsiveness at the beginning while also making sure
     * that all the ops process fairly quickly.
     */
    private processDeltasAsync(processingTime = asyncProcessingStartTime) {
        const startTime = performanceNow();
        let elaspedTime = 0;
        // Loop over the local messages until no messages to process, we have become paused, we hit an error
        // or the processing time has elasped.
        while (!(this.q.length === 0 || this.paused || this.error || elaspedTime >= processingTime)) {
            // Get the next message in the queue
            const next = this.q.shift();

            // Process the message.
            try {
                this.worker(next!);
                this.emit("op", next);
            } catch (error) {
                this.error = error;
                this.emit("error", error);
            }

            elaspedTime = performanceNow() - startTime;
        }

        if (this.asyncProcessingLog) {
            this.asyncProcessingLog.numberOfBatches++;
            this.asyncProcessingLog.totalProcessingTime += elaspedTime;
        }

        if (this.q.length === 0 || this.paused || this.error) {
            if (asyncProcessingCount % 2000 === 0 && this.asyncProcessingLog) {
                this.logger.sendTelemetryEvent({
                    eventName: "AsyncDeltaProcessingComplete",
                    numberOfOps: this.asyncProcessingLog.numberOfOps,
                    numberOfBatches: this.asyncProcessingLog.numberOfBatches,
                    processingTime: this.asyncProcessingLog.totalProcessingTime,
                });
                this.asyncProcessingLog = undefined;
            }
            if (this.processingDeferredAsync) {
                this.processingDeferredAsync.resolve();
                this.processingDeferredAsync = undefined;
            }
        } else {
            // Increase the allowed processing time by asyncProcessingTimeIncrease for the next iteration.
            setTimeout(() => {
                this.processDeltasAsync(processingTime + asyncProcessingTimeIncrease);
            });
        }
    }
}
