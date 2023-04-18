/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

// eslint-disable-next-line import/no-internal-modules
import { initializeDevtoolsView } from "../devtools/InitializeView";

/**
 * Injects the App and Devtools Panel views into the test harness.
 */

async function renderDevtoolsView(element: HTMLElement): Promise<void> {
	return initializeDevtoolsView(element);
}

async function renderAppView(target: HTMLElement): Promise<void> {
	ReactDOM.render(React.createElement("div", { children: ["TODO"] }), target);
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
export async function setupTestPage(): Promise<void> {
	const appViewElement = document.querySelector("#app-view") as HTMLDivElement;
	if (appViewElement === null) {
		throw new Error("app-view element does not exist");
	}
	await renderAppView(appViewElement);

	const devtoolsViewElement = document.querySelector("#devtools-view") as HTMLDivElement;
	if (devtoolsViewElement === null) {
		throw new Error("devtools-view element does not exist");
	}
	await renderDevtoolsView(devtoolsViewElement);
}
