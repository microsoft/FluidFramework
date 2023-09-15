/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ThemeProvider } from "@fluentui/react";
import { CollaborativeProps, CollaborativeView } from "./collaborativeView";
import { darkTheme, rootStyle } from "./constants";

export const CollaborativeRootView = (props: CollaborativeProps) => {
	return (
		<ThemeProvider applyTo="body" theme={darkTheme}>
			<div style={rootStyle}>
				<CollaborativeView model={props.model} />
			</div>
		</ThemeProvider>
	);
};
