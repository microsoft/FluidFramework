/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This class is a thin wrapper over setTimeout and clearTimeout which
 * makes it simpler to keep track of recurring timeouts with the same
 * or similar handlers and timeouts.
 */
export class Timer {
    /**
     * Returns true if there is an underlying timeout running.
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
        // run clear first, in case the handler decides to start again
        this.clear();
        handler();
    }
}
