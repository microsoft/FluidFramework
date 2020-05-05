/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "./promises";

export interface ITimer {
    /**
     * True if timer is currently running
     */
    readonly hasTimer: boolean;

    /**
     * Starts the timer
     */
    start(): void;

    /**
     * Cancels the timer if already running
     */
    clear(): void;
}

/**
 * This class is a thin wrapper over setTimeout and clearTimeout which
 * makes it simpler to keep track of recurring timeouts with the same
 * or similar handlers and timeouts.
 */
export class Timer implements ITimer {
    /**
     * Returns true if the timer is running.
     */
    public get hasTimer() {
        return !!this.timer;
    }

    private timer?: NodeJS.Timeout;

    constructor(
        private readonly defaultTimeout: number,
        private readonly defaultHandler: () => void) {}

    /**
     * Calls setTimeout and tracks the resulting timeout.
     * @param ms - overrides default timeout in ms
     * @param handler - overrides default handler
     */
    public start(ms: number = this.defaultTimeout, handler: () => void = this.defaultHandler) {
        this.clear();
        this.timer = setTimeout(() => this.wrapHandler(handler), ms);
    }

    /**
     * Calls clearTimeout on the underlying timeout if running.
     */
    public clear() {
        if (!this.timer) {
            return;
        }
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    protected wrapHandler(handler: () => void) {
        // Run clear first, in case the handler decides to start again
        this.clear();
        handler();
    }
}

/**
 * Timer which offers a promise that fulfills when the timer
 * completes.
 */
export interface IPromiseTimer extends ITimer {
    /**
     * Starts the timer and returns a promise that
     * resolves when the timer times out, or
     * rejects if clear is called.
     */
    start(): Promise<void>;
}

/**
 * This class is a wrapper over setTimeout and clearTimeout which
 * makes it simpler to keep track of recurring timeouts with the
 * same handlers and timeouts, while also providing a promise that
 * settles when it times out.
 */
export class PromiseTimer implements IPromiseTimer {
    private deferred?: Deferred<void>;
    private readonly timer: Timer;

    public get hasTimer() {
        return this.timer.hasTimer;
    }

    constructor(
        defaultTimeout: number,
        defaultHandler: () => void,
    ) {
        this.timer = new Timer(defaultTimeout, () => this.wrapHandler(defaultHandler));
    }

    public async start(ms?: number, handler?: () => void): Promise<void> {
        this.clear();
        this.deferred = new Deferred();
        this.timer.start(ms, handler ? () => this.wrapHandler(handler) : undefined);
        return this.deferred.promise;
    }

    public clear() {
        this.timer.clear();
        if (this.deferred) {
            this.deferred.reject("canceled");
            this.deferred = undefined;
        }
    }

    protected wrapHandler(handler: () => void) {
        handler();
        this.deferred!.resolve();
    }
}
