/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Borrowed from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
// Avoids runtime errors with circular references.
// Not ideal, as will cut values that are not necessarily circular references.
// Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)
const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key: string, value: any): any => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "<removed/circular>";
            }
            seen.add(value);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return value;
    };
};

/**
 * Parse error message
 *
 * @param message - initial message `socket.io (${handler})`
 * @param error - incoming error object
 * @returns the correct error message
 */
 export function parseErrorMessage(message: string, error?: any): string {
    let newMessage = message;
    if (typeof error !== "object") {
        newMessage = `${message}: ${error}`;
    } else if (error?.type === "TransportError") {
        // JSON.stringify drops Error.message
        if (error?.message !== undefined) {
            newMessage = `${message}: ${error.message}`;
        }
        // Websocket errors reported by engine.io-client.
        // They are Error objects with description containing WS error and description = "TransportError"
        // Please see https://github.com/socketio/engine.io-client/blob/7245b80/lib/transport.ts#L44,
        newMessage = `${newMessage}: ${JSON.stringify(error, getCircularReplacer())}`;
    } else {
        newMessage = `${message}: [object omitted]`;
    }
    return newMessage;
}
