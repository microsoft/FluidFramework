/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExampleErrorView, ExampleLoadingView } from "@fluid-example/example-utils";
import { toPropTreeNode } from "@fluidframework/react/alpha";
import type { ReactElement } from "react";

import { GuestFrame } from "./guestFrame.js";
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
 *
 * @remarks
 * Host inventory controls are available as soon as the container is ready, independently of Guest startup.
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
					<GuestFrame view={state.container.data} />
				</section>
			</div>
		</main>
	);
}
