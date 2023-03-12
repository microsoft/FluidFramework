/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This directory contains React components for use in both our `content-extension` and `devtools-extension` variants.
 *
 * @remarks
 *
 * Since the extensions are not run in the same context as the webpage being analyzed, these components must
 * communicate with the debugger via message passing.
 *
 * In order to ensure that the message passing works in both of our extension patterns, messages must be sent and
 * received via the {@link IMessageRelay} provided via the {@link MessageRelayContext}.
 */

export { DebuggerPanel } from "./DebuggerPanel";
export { MessageRelayContext } from "./MessageRelayContext";
