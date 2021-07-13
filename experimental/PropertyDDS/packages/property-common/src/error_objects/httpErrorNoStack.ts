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
    /* @param {string} message The error message
     * @param {number} statusCode A numeric HTTP status code
     * @param {string} statusMessage A string message representing the response status message
     * @param {string} method The HTTP method used in the request
     * @param {string} url The URL that the request was sent to
     * @param {?number} flags Flags that characterize the error. See {@link FlaggedError#FLAGS}.
     * @constructor
     * @alias property-common.HTTPErrorNoStack
     * @private
     */
    constructor(message?, statusCode?, statusMessage?, method?, url?, flags?) {
        super(message, statusCode, statusMessage, method, url, flags);
        Object.setPrototypeOf(this, HTTPErrorNoStack.prototype);
        delete this.stack;
    }

    /**
     * Returns a string representing the HTTPErrorNoStack object
     * @return a string representing the HTTPErrorNoStack object
     */
    toString(): string {
        return this.message;
    }
}
