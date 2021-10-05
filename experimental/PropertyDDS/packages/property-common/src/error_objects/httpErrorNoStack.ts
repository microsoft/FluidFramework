/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { HTTPError } from "./httpError";
import { FlaggedError } from "./flaggedError";

/**
 * Class extending HTTPError without storing the stack
 */
export class HTTPErrorNoStack extends HTTPError {
    static FLAGS = FlaggedError.FLAGS;

    /**
     * @param message - The error message
     * @param statusCode - A numeric HTTP status code
     * @param statusMessage - A string message representing the response status message
     * @param method - The HTTP method used in the request
     * @param url - The URL that the request was sent to
     * @param flags - Flags that characterize the error. See {@link FlaggedError.FLAGS}.
     */
    constructor(message?, statusCode?, statusMessage?, method?, url?, flags?) {
        super(message, statusCode, statusMessage, method, url, flags);
        Object.setPrototypeOf(this, HTTPErrorNoStack.prototype);
        delete this.stack;
    }

    toString(): string {
        return this.message;
    }
}
