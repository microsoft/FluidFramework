/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toPropTreeNode } from "@fluidframework/react/alpha";
import type { ReactElement } from "react";

import type { GuestSessionState } from "./guestSession.js";
import { InventoryView } from "./inventoryView.js";
/**
 * The page rendered inside the Guest iframe.
 */
export function GuestView({ state }: { state: GuestSessionState }): ReactElement {
	return (
		<main style={{ padding: "1rem" }}>
			<h1>Guest</h1>
			{state.status === "ready" ? (
				<InventoryView root={toPropTreeNode(state.view.root)} />
			) : state.status === "error" ? (
				<p role="alert">Guest error: {state.error.message}</p>
			) : (
				<p role="status">Connecting to Host...</p>
			)}
		</main>
	);
}
