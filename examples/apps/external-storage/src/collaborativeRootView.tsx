/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ThemeProvider } from "@fluentui/react";
import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { LoadableDataObject } from "@fluid-experimental/to-non-fluid";
import { CollaborativeView } from "./collaborativeView";
import { darkTheme, rootStyle } from "./constants";

export interface CollaborativeRootProps {
	model: LoadableDataObject;
}

export const CollaborativeRootView = (props: CollaborativeRootProps) => {
	const handleState = React.useState<IFluidHandle<LoadableDataObject> | undefined>(undefined);
	return (
		<ThemeProvider applyTo="body" theme={darkTheme} style={{ height: "100%" }}>
			<FluentProvider theme={webDarkTheme} style={{ height: "100%" }}>
				<div style={rootStyle}>
					<CollaborativeView model={props.model} handleState={handleState} />
				</div>
			</FluentProvider>
		</ThemeProvider>
	);
};
