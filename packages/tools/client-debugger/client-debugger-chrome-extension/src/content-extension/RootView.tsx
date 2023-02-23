/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { DebuggerPanel, MessageRelayContext } from "../shared-components";

import { WindowConnection } from "./messaging";

/**
 * Root debugger view component.
 *
 * @remarks Sets up message-passing context, and renders the debugger.
 */
export function RootView(): React.ReactElement {
	const messageRelay = React.useMemo<WindowConnection>(() => new WindowConnection(), []);
	return (
		<MessageRelayContext.Provider value={messageRelay}>
			<DebuggerPanel />
		</MessageRelayContext.Provider>
	);
}
