/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { createRoot } from "react-dom/client";

export function showErrorMessage(message?: string, ...optionalParams: string[]) {
	// create the root element for React
	const error = document.createElement("div");
	error.id = "app";
	document.body.appendChild(error);
	const root = createRoot(error);

	// Render the error message
	root.render(
		<div className="container mx-auto p-2 m-4 border-2 border-black rounded">
			<p>{message}</p>
			<p>{optionalParams.join(" ")}</p>
		</div>,
	);
}
