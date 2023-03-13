/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDebuggerMessage } from "./Messages";
/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 *
 * @internal
 */
export declare function postMessageToWindow<TMessage extends IDebuggerMessage>(message: TMessage, loggingOptions?: MessageLoggingOptions): void;
/**
 * Handlers for incoming {@link IDebuggerMessage}s.
 *
 * @internal
 */
export interface InboundHandlers {
    /**
     * Mapping from {@link IDebuggerMessage."type"}s to a handler callback for that message type.
     * @returns Whether or not the message was actually handled.
     */
    [type: string]: (message: IDebuggerMessage) => boolean;
}
/**
 * Console logging options for {@link handleIncomingWindowMessage}.
 *
 * @privateRemarks TODO: Introduce better diagnostic logging infra for the entire library
 *
 * @internal
 */
export interface MessageLoggingOptions {
    /**
     * Context to associate with the log text.
     * Messages will be logged in the form: `(<context>): <text>`.
     */
    context?: string;
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
export declare function handleIncomingWindowMessage(event: MessageEvent<Partial<IDebuggerMessage>>, handlers: InboundHandlers, loggingOptions?: MessageLoggingOptions): void;
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
export declare function handleIncomingMessage(message: Partial<IDebuggerMessage>, handlers: InboundHandlers, loggingOptions?: MessageLoggingOptions): void;
/**
 * Determines whether the provided event message data is an {@link IDebuggerMessage}.
 *
 * @internal
 */
export declare function isDebuggerMessage(value: Partial<IDebuggerMessage>): value is IDebuggerMessage;
//# sourceMappingURL=Utilities.d.ts.map