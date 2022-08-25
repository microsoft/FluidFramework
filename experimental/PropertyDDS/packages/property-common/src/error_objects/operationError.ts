/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * An operation error maintains additional information compared to a plain {@link #Error}:
 * - The operation name
 * - A status code
 * - Extensible flags. See {@link ExtendedError.FLAGS}.
 */
import _ from "lodash";
import { FlaggedError } from "./flaggedError";

export class OperationError extends Error {
    static FLAGS = FlaggedError.FLAGS;
    public stack: string | undefined;
    public readonly name: string;

    /**
       * Instantiates an OperationError, which mimics the Error class with added properties
       * meant for reporting the result of operations.
       * @param message - The error message.
       * @param operation - The operation name.
       * @param statusCode - The operation result as a numerical status code.
       * @param flags - Flags that characterize the error. See {@link FlaggedError.FLAGS}.
       */
    constructor(
        message?: string,
        public operation?: string,
        public statusCode?: number,
        public flags: number = 0,
    ) {
        super(message);
        Object.setPrototypeOf(this, OperationError.prototype);
        this.name = "OperationError";
        this.stack = Error(message).stack;
    }

    isQuiet() {
        return FlaggedError.prototype.isQuiet.call(this);
    }

    isTransient() {
        return FlaggedError.prototype.isTransient.call(this);
    }

    /**
     * @returns A string representation of the error flags.
     */
    private _flagsToString() {
        const flagArray: string[] = [];
        _.mapValues(FlaggedError.FLAGS, (flagValue, flagName) => {
            // eslint-disable-next-line no-bitwise
            if ((this.flags & flagValue) === flagValue) {
                flagArray.push(flagName);
            }
        });
        return `${this.flags} [${flagArray.join(",")}]`;
    }

    toString(): string {
        const extendedFieldsArray: string[] = [];
        if (this.operation !== undefined) {
            extendedFieldsArray.push(this.operation);
        }

        if (this.statusCode !== undefined) {
            extendedFieldsArray.push(this.statusCode.toString());
        }

        if (this.flags) {
            extendedFieldsArray.push(this._flagsToString.call(this));
        }

        let msg = this.name;

        if (extendedFieldsArray.length > 0) {
            msg += `[${extendedFieldsArray.join(", ")}]`;
        }

        msg += `: ${this.message}`;

        if (this.stack !== undefined) {
            msg += `, stack: ${this.stack}`;
        }

        return msg;
    }
}
