/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { flushSync } from "react-dom";

import { toError } from "./bootstrap.js";
import { startGuestSession } from "./guestSession.js";
import { GuestView } from "./guestView.js";
import { renderPage } from "./render.js";

const root = renderPage(<GuestView state={{ status: "connecting" }} />);

try {
	// Install the port receiver synchronously, before the Host observes this iframe's load event.
	const dispose = startGuestSession((state) => {
		// Connected must mean that React has committed the inventory, not merely queued it.
		// eslint-disable-next-line @eslint-react/dom-no-flush-sync -- Only bootstrap state transitions are synchronous, not inventory edits.
		flushSync(() => root.render(<GuestView state={state} />));
	});
	// Best-effort cleanup when the Guest page unloads.
	window.addEventListener("pagehide", (event) => {
		// Preserve sessions entering the back/forward cache so they can resume when the page returns.
		if (!event.persisted) {
			// Remove UI subscriptions before disposing the tree views they observe.
			root.unmount();
			dispose();
		}
	});
} catch (error) {
	console.error("Failed to start Guest:", error);
	root.render(<GuestView state={{ status: "error", error: toError(error) }} />);
}
