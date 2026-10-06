/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExampleErrorView, ExampleLoadingView } from "@fluid-example/example-utils";
import { toPropTreeNode } from "@fluidframework/react/alpha";
import type { ReactElement } from "react";

import type { HostContainer } from "./host.js";
import { InventoryView } from "./inventoryView.js";

/**
 * Host startup state. The ready state retains the container and its tree view.
 */
export type HostState =
	| { readonly status: "loading" }
	| { readonly status: "ready"; readonly container: HostContainer }
	| { readonly status: "error"; readonly error: unknown };

/**
 * The top-level Host page.
 */
export function HostView({ state }: { state: HostState }): ReactElement {
	if (state.status === "loading") {
		return <ExampleLoadingView />;
	}
	if (state.status === "error") {
		return <ExampleErrorView error={state.error} />;
	}

	return (
		<main style={{ padding: "1rem" }}>
			<h1>Sandboxed inventory</h1>
			<p>Tree synchronization is not implemented yet.</p>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
					gap: "1rem",
				}}
			>
				<section aria-labelledby="host-heading">
					<h2 id="host-heading">Host</h2>
					<InventoryView root={toPropTreeNode(state.container.data.root)} />
				</section>
				<section aria-labelledby="guest-heading">
					<h2 id="guest-heading">Guest</h2>
					<iframe
						title="Guest inventory"
						src="./guest.html"
						sandbox="allow-scripts"
						style={{ width: "100%", minHeight: "20rem", border: "1px solid #888" }}
					/>
				</section>
			</div>
		</main>
	);
}
