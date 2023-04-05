/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains an extensible debug visualizer / editor for the Fluid client.
 *
 * @remarks
 *
 * The entry-point to this package is {@link RootView}, a {@link https://react.dev/reference/react/Component | React Component}
 * for displaying debug information, which can be added to your Fluid-backed React app.
 *
 * @privateRemarks TODO: Add examples once the API surface has solidified.
 *
 * @packageDocumentation
 */

export { AudienceMember } from "./Audience";
export { AudienceMemberViewProps } from "./components";
export { MessageRelayContext } from "./MessageRelayContext";
export { RootView, RootViewProps } from "./RootView";
export { IMessageRelay } from "@fluid-tools/client-debugger";
