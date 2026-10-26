/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReactNode } from "react";
// eslint-disable-next-line import-x/no-internal-modules -- React's supported client entry point.
import { createRoot, type Root } from "react-dom/client";

/**
 * Mounts a page without importing service-client utilities into the Guest bundle.
 * @param content - The page to render.
 * @returns The React root, owned by the caller.
 */
export function renderPage(content: ReactNode): Root {
	const element = document.querySelector("#content");
	if (element === null) {
		throw new Error("No #content element found.");
	}
	const root = createRoot(element);
	root.render(content);
	return root;
}
