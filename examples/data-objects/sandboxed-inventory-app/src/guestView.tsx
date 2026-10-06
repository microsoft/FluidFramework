/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReactElement } from "react";

/**
 * The page rendered inside the Guest iframe.
 */
export function GuestView(): ReactElement {
	return (
		<main style={{ padding: "1rem" }}>
			<h1>Guest</h1>
			<p>Tree synchronization is not implemented yet.</p>
		</main>
	);
}
