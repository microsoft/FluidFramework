/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReactElement } from "react";

/**
 * The top-level Host page.
 */
export function HostView(): ReactElement {
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
					<p>The Host inventory will appear here.</p>
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
