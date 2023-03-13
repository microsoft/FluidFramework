/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 *
 * @internal
 */
export function postMessageToWindow(message, loggingOptions) {
    var _a;
    const loggingPreamble = (loggingOptions === null || loggingOptions === void 0 ? void 0 : loggingOptions.context) === undefined ? "" : `${loggingOptions.context}: `;
    console.log(`${loggingPreamble}Posting message to the window:`, message); // TODO: console.debug
    (_a = globalThis.postMessage) === null || _a === void 0 ? void 0 : _a.call(// TODO: console.debug
    globalThis, message, "*"); // TODO: verify target is okay
}
/**
 * Utility function for handling incoming events.
 *
 * @param event - The window event containing the message to handle.
 * @param handlers - List of handlers for particular event types.
 * If the incoming event's message type has a corresponding handler callback, that callback will be invoked.
 * Otherwise, this function will no-op.
 *
 * @internal
 */
export function handleIncomingWindowMessage(event, handlers, loggingOptions) {
    return handleIncomingMessage(event.data, handlers, loggingOptions);
}
/**
 * Utility function for handling incoming events.
 *
 * @param message - The window event containing the message to handle.
 * @param handlers - List of handlers for particular event types.
 * If the incoming event's message type has a corresponding handler callback, that callback will be invoked.
 * Otherwise, this function will no-op.
 *
 * @internal
 */
export function handleIncomingMessage(message, handlers, loggingOptions) {
    if (message === undefined || !isDebuggerMessage(message)) {
        return;
    }
    if (handlers[message.type] === undefined) {
        // No handler for this type provided. No-op.
        return;
    }
    const handled = handlers[message.type](message);
    // Only log if the message was actually handled by the recipient.
    if (handled) {
        const loggingPreamble = (loggingOptions === null || loggingOptions === void 0 ? void 0 : loggingOptions.context) === undefined ? "" : `${loggingOptions.context}: `;
        console.log(`${loggingPreamble} message handled:`, message); // TODO: console.debug
    }
}
/**
 * Determines whether the provided event message data is an {@link IDebuggerMessage}.
 *
 * @internal
 */
export function isDebuggerMessage(value) {
    return typeof value.source === "string" && value.type !== undefined;
}
//# sourceMappingURL=Utilities.js.map