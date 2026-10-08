/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { loadHost } from "./host.js";
import { HostView } from "./hostView.js";
import { renderPage } from "./render.js";

const root = renderPage(<HostView state={{ status: "loading" }} />);

try {
	const container = await loadHost();
	root.render(<HostView state={{ status: "ready", container }} />);
} catch (error) {
	console.error("Failed to start:", error);
	root.render(<HostView state={{ status: "error", error }} />);
}
