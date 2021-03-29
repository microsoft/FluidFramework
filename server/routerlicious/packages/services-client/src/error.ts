/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class NetworkError extends Error {
    constructor(
        /**
         * HTTP status code that describes the error.
         */
        public readonly code: number,
        message: string,
    ) {
        super(message);
    }
}
