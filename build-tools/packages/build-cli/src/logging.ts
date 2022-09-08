/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Logger } from "@fluidframework/build-tools";

/**
 * An extension of the {@link Logger} interface that adds logging capabilities useful when writing terminal CLIs.
 */
export interface CommandLogger extends Logger {
    /** Logs a horizontal rule -- a visual line break. */
    logHr(): void;

    /**
     * Logs a message indented by the specified amount.
     *
     * @param msg - The message to log.
     * @param indent - The number of spaces to indent.
     */
    logIndent(msg: string, indent: number): void;
}
