/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ReactElement, useEffect, useRef } from "react";

const pagefindComponentScript = "/pagefind/pagefind-component-ui.js";
let pagefindModalTrigger: HTMLElement | undefined;
let pagefindModal: HTMLElement | undefined;

/**
 * Renders the Pagefind component UI in Docusaurus's navbar search slot.
 */
export default function SearchBar(): ReactElement {
	const triggerContainer = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		pagefindModalTrigger ??= document.createElement("pagefind-modal-trigger");
		pagefindModalTrigger.setAttribute("placeholder", "Search");
		triggerContainer.current?.append(pagefindModalTrigger);

		pagefindModal ??= document.createElement("pagefind-modal");
		pagefindModal.setAttribute("reset-on-close", "true");
		if (!pagefindModal.isConnected) {
			document.body.append(pagefindModal);
		}

		if (document.querySelector(`script[src="${pagefindComponentScript}"]`) !== null) {
			return;
		}

		const script = document.createElement("script");
		script.src = pagefindComponentScript;
		script.type = "module";
		document.head.append(script);
	}, []);

	return <span ref={triggerContainer} />;
}
