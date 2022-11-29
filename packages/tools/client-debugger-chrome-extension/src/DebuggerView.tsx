/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { FluidClientDebugger } from "@fluid-tools/client-debug-view";

/**
 * ClassName identifier used for the container element created to store the debugger panel.
 */
export const panelClassName = "fluid-debug-view-panel";

/**
 * Container to display debug view within.
 * Mounts itself automatically to the right side of the screen.
 */
export function DebuggerView({ containerId }: { containerId: string }): React.ReactElement {
	// KLUDGE until we have component that manages registry stuff.
	return (
		<div
			style={{
				position: "fixed",
				width: "400px",
				height: "100%",
				top: "0px",
				right: "0px",
				zIndex: "999999999",
				backgroundColor: "darkgray", // TODO: remove
			}}
			className={panelClassName}
		>
			<FluidClientDebugger containerId={containerId} />
		</div>
	);
}
