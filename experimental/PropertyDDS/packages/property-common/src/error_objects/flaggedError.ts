/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Checks if a flag is set
 * @param  flags - flags set within an error object
 * @param  flag - A flag to be checked
 * @returns   True if the flag is set in passed flags, false otherwise.
 */
 const _isFlagSet = (flags: number, flag: number) => {
    // eslint-disable-next-line no-bitwise
    return (flags & flag) === flag;
};

export class FlaggedError {
    /**
     * Flags that may be set on an error instance.
     */
    static FLAGS = {
        /**
         * A transient error results from an operation that could succeed if retried.
         */
        TRANSIENT: 1,
        /**
         * A quiet error should not trigger an error log.
         */
        QUIET: 2,
    };

    protected flags: number = 0;

    /**
     * @returns True if the quiet flag is set.
     */
    isQuiet(): boolean {
        return _isFlagSet(this.flags, FlaggedError.FLAGS.QUIET);
    }

    /**
     * @returns True if the transient flag is set.
     */
    isTransient(): boolean {
        return _isFlagSet(this.flags, FlaggedError.FLAGS.TRANSIENT);
    }
}
