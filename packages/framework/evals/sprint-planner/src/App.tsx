/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRoot } from "react-dom/client";

import { SprintApp } from "./SprintApp.js";
import { createOrLoadContainer } from "./fluid.js";

async function start(): Promise<void> {
	// Auth is handled server-side by the webpack dev server proxy (/azure-openai).
	// The proxy injects an Entra ID token using DefaultAzureCredential (az login).
	// This no-op provider satisfies the AzureOpenAI SDK constructor; the real token
	// is injected by the proxy before the request reaches Azure.
	const azureADTokenProvider = async (): Promise<string> => "proxy-handled";

	const treeView = await createOrLoadContainer();
	const root = createRoot(document.querySelector("#root")!);
	root.render(<SprintApp treeView={treeView} azureADTokenProvider={azureADTokenProvider} />);
}

start().catch((error) => {
	console.error("Failed to start:", error);
});
