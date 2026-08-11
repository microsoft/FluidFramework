/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ReactElement, StrictMode, useLayoutEffect } from "react";
// eslint-disable-next-line import-x/no-internal-modules -- This is the pattern prescribed by React
import { createRoot } from "react-dom/client";

import { App } from "../components/index.js";

console.log("Rendering app...");

/**
 * Wraps the app so the "rendered" log fires after the initial render has been committed to the
 * DOM. useLayoutEffect runs synchronously after DOM mutations and before paint, matching the
 * timing of the callback that ReactDOM.render previously provided.
 */
function AppRoot(): ReactElement {
	useLayoutEffect(() => {
		console.log("App rendered!");
	}, []);
	return (
		<StrictMode>
			<App />
		</StrictMode>
	);
}

const contentElement = document.querySelector("#content") as HTMLElement;
const root = createRoot(contentElement);
root.render(<AppRoot />);
