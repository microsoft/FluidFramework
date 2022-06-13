/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FlaggedError } from "./flaggedError";

/**
 * Class extending Error with HTTP-specific error information like statusCode and statusMessage
 * @param title - The error title
 * @param statusCode - A numeric HTTP status code
 * @param statusMessage - A string message representing the response status message
 * @param method - The HTTP method used in the request
 * @param url - The URL that the request was sent to
 * @param flags - Flags that characterize the error. See {@link FlaggedError.FLAGS}.
 */
export class HTTPError extends Error {
    constructor(
        public title?: string,
        public statusCode?: number,
        public statusMessage?: string,
        public method?: string,
        public url?: string,
        public flags = 0,
    ) {
        super();
        Object.setPrototypeOf(this, HTTPError.prototype);
        this.name = "HTTPError";
        this.message = this._generateMessage(title, statusCode, statusMessage, method, url);
        this.stack = (new Error(this.message)).stack;
    }

    static FLAGS = FlaggedError.FLAGS;

    isQuiet(): boolean {
        return FlaggedError.prototype.isQuiet.call(this);
    }

    isTransient(): boolean {
        return FlaggedError.prototype.isTransient.call(this);
    }

    private _generateMessage(title, statusCode, statusMessage, method, url) {
        const titleStr = (title === undefined) ? "" : String(title);
        const statusCodeStr = (statusCode === undefined) ? "" : String(statusCode);
        const statusMessageStr = (statusMessage === undefined) ? "" : String(statusMessage);
        const methodStr = (method === undefined) ? "" : String(method);
        const urlStr = (url === undefined) ? "" : String(url);

        return `HTTPError: ${titleStr}, statusCode:${statusCodeStr}, ` +
            `statusMessage:${statusMessageStr}, method:${methodStr}, url:${urlStr}`;
    }

    /**
     * Returns a string representing the HTTPError object
     * @returns a string representing the HTTPError object
     */
    toString(): string {
        const stack = (this.stack === undefined) ? "" : String(this.stack);

        const isFirefox = typeof window !== "undefined" &&
            typeof window.navigator !== "undefined" &&
            typeof window.navigator.userAgent !== "undefined" &&
            window.navigator.userAgent.toLowerCase().includes("firefox");

        return isFirefox ? `${this.message}, stack:${stack}` : `stack:${stack}`;
    }
}
