/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ReactElement, useEffect, useRef } from "react";

const pagefindComponentScript = "/pagefind/pagefind-component-ui.js";
const pagefindResultTemplate = `
<li class="pf-result"{{#if meta.api_item_name}} data-api-item-name="{{ meta.api_item_name }}"{{/if}}>
  <div class="pf-result-card">
    <div class="pf-result-content">
      <p class="pf-result-title">
        <a class="pf-result-link" href="{{ meta.url | default(url) | safeUrl }}">{{ meta.title }}</a>
        {{#if meta.version}}<span class="api-result-version">{{ meta.version }}</span>{{/if}}
      </p>
      {{#if excerpt}}<p class="pf-result-excerpt">{{+ excerpt +}}</p>{{/if}}
    </div>
  </div>
  {{#if sub_results}}
  <ul class="pf-heading-chips">
    {{#each sub_results as sub}}
    <li class="pf-heading-chip">
      <a class="pf-heading-link" href="{{ sub.url | safeUrl }}">{{ sub.title }}</a>
      <p class="pf-heading-excerpt">{{+ sub.excerpt +}}</p>
    </li>
    {{/each}}
  </ul>
  {{/if}}
</li>`;
let pagefindModalTrigger: HTMLElement | undefined;
let pagefindModal: HTMLElement | undefined;

function normalizeApiItemName(value: string): string {
	return value.replace(/[^\p{L}\p{N}_$]/gu, "").toLowerCase();
}

function updateExactApiMatches(modal: HTMLElement): void {
	const query = normalizeApiItemName(
		modal.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? "",
	);

	for (const result of modal.querySelectorAll<HTMLElement>("[data-api-item-name]")) {
		const existingLabel = result.querySelector(".api-exact-match-label");
		const apiItemName = result.dataset.apiItemName;
		const isExactMatch =
			query !== "" &&
			apiItemName !== undefined &&
			normalizeApiItemName(apiItemName) === query;

		if (isExactMatch && existingLabel === null) {
			const label = document.createElement("span");
			label.className = "api-exact-match-label";
			label.textContent = "Exact API match";
			result.querySelector(".pf-result-title")?.prepend(label);
		} else if (!isExactMatch) {
			existingLabel?.remove();
		}
	}
}

function createPagefindModal(): HTMLElement {
	const modal = document.createElement("pagefind-modal");
	modal.setAttribute("reset-on-close", "true");

	const header = document.createElement("pagefind-modal-header");
	header.append(document.createElement("pagefind-input"));

	const body = document.createElement("pagefind-modal-body");
	body.append(document.createElement("pagefind-summary"));

	const results = document.createElement("pagefind-results");
	const template = document.createElement("script");
	template.type = "text/pagefind-template";
	template.textContent = pagefindResultTemplate;
	results.append(template);
	body.append(results);

	const footer = document.createElement("pagefind-modal-footer");
	footer.append(document.createElement("pagefind-keyboard-hints"));

	modal.append(header, body, footer);
	modal.addEventListener("input", () => updateExactApiMatches(modal));
	new MutationObserver(() => updateExactApiMatches(modal)).observe(results, {
		childList: true,
		subtree: true,
	});
	return modal;
}

/**
 * Renders the Pagefind component UI in Docusaurus's navbar search slot.
 */
export default function SearchBar(): ReactElement {
	const triggerContainer = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		pagefindModalTrigger ??= document.createElement("pagefind-modal-trigger");
		pagefindModalTrigger.setAttribute("placeholder", "Search");
		triggerContainer.current?.append(pagefindModalTrigger);

		pagefindModal ??= createPagefindModal();
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

	return <span className="pf-search-trigger" ref={triggerContainer} />;
}
