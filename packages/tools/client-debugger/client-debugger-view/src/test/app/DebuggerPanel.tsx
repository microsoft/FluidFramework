/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Resizable } from "re-resizable";
import React from "react";

import { FluidClientDebuggers } from "../../Debugger";

/**
 * Renders drop down to show more than 2 containers and manage the selected container in the debug view for an active
 * debugger session registered using {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function DebuggerPanel(): React.ReactElement {
	return (
		<Resizable
			style={{
				position: "absolute",
				top: "0px",
				right: "0px",
				bottom: "0px",
				zIndex: "2",
				backgroundColor: "rgba(180, 180, 180, 0.85)",
			}}
			defaultSize={{ width: 400, height: "100%" }}
			className={"debugger-panel"}
		>
			<FluidClientDebuggers />
		</Resizable>
	);
}
