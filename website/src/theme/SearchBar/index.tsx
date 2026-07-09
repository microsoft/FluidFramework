/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createElement, type ReactElement, useEffect } from "react";

const pagefindComponentScript = "/pagefind/pagefind-component-ui.js";

/**
 * Renders the Pagefind component UI in Docusaurus's navbar search slot.
 */
export default function SearchBar(): ReactElement {
	useEffect(() => {
		if (document.querySelector(`script[src="${pagefindComponentScript}"]`) !== null) {
			return;
		}

		const script = document.createElement("script");
		script.src = pagefindComponentScript;
		script.type = "module";
		document.head.append(script);
	}, []);

	return (
		<>
			{createElement("pagefind-modal-trigger", { placeholder: "Search" })}
			{createElement("pagefind-modal", { "reset-on-close": true })}
		</>
	);
}
