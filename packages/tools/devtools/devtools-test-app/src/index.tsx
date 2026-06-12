/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DevtoolsPanel, WindowMessageRelay } from "@fluid-internal/devtools-view";
import { Resizable } from "re-resizable";
import { type ReactElement, useLayoutEffect } from "react";
// eslint-disable-next-line import-x/no-internal-modules -- This is the pattern prescribed by React
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

console.log("Rendering app...");

const contentElement = document.querySelector("#content") as HTMLElement;
const appRoot = createRoot(contentElement);
appRoot.render(<AppRoot />);

const devtoolsElement = document.createElement("devtools");
document.body.append(devtoolsElement);

const devtoolsRoot = createRoot(devtoolsElement);
devtoolsRoot.render(<DevtoolsView />);

/**
 * Wraps the app so the "App rendered!" log fires once the initial render has been committed to the
 * DOM. useLayoutEffect runs synchronously after DOM mutations and before the browser paints.
 *
 * @remarks
 * `<App />` is intentionally not wrapped in `<StrictMode>`. `App` initializes a singleton Devtools
 * instance via `initializeDevtools` and disposes it in an effect cleanup. Under StrictMode, React
 * intentionally double-invokes effects on mount (setup -> cleanup -> setup), which disposes that
 * singleton and leaves subsequent renders pointing at a disposed instance ("The devtools instance
 * has been disposed"). The app is not resilient to that remount cycle, so StrictMode is omitted here.
 */
function AppRoot(): ReactElement {
	useLayoutEffect(() => {
		console.log("App rendered!");
	}, []);
	return <App />;
}

function DevtoolsView(): ReactElement {
	useLayoutEffect(() => {
		console.log("Devtools UI rendered!");
		// Setting "fluidStarted" is just for our test automation
		globalThis.fluidStarted = true;
	}, []);
	return (
		<Resizable
			style={{
				position: "absolute",
				top: "0px",
				right: "0px",
				bottom: "0px",
				zIndex: "2",
				backgroundColor: "lightgray", // TODO: remove
			}}
			enable={{ left: true }} // Only allow re-sizing from the left.
			defaultSize={{ width: 500, height: "100%" }}
		>
			<DevtoolsPanel messageRelay={new WindowMessageRelay("fluid-framwork-devtools-inline")} />
		</Resizable>
	);
}
