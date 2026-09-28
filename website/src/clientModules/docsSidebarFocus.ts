/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ThemeClassNames } from "@docusaurus/theme-common";
import type { ClientModule } from "@docusaurus/types";

const docsSidebarLinkSelector = `.${ThemeClassNames.docs.docSidebarMenu} a.menu__link[href]`;
let pendingSidebarNavigation: string | undefined;
let requestFocus: (() => void) | undefined;

function getNavigationPath(location: { pathname: string; search: string }): string {
	const path = location.pathname;
	return `${path.length > 1 ? path.replace(/\/+$/u, "") : path}${location.search}`;
}

function onClick(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const sidebarLink = target.closest<HTMLAnchorElement>(docsSidebarLinkSelector);
	if (sidebarLink === null) {
		return;
	}

	if (event.defaultPrevented && sidebarLink.getAttribute("href") === "#") {
		pendingSidebarNavigation = undefined;
	}
}

function onKeyDown(event: KeyboardEvent): void {
	if (
		event.key !== "Enter" ||
		event.defaultPrevented ||
		event.repeat ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	) {
		return;
	}

	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const sidebarLink = target.closest<HTMLAnchorElement>(docsSidebarLinkSelector);
	if (sidebarLink === null) {
		return;
	}

	const href = sidebarLink.getAttribute("href");
	if (href === null || href === "#") {
		return;
	}

	let url: URL;
	try {
		url = new URL(href, window.location.origin);
	} catch {
		return;
	}

	if (url.origin !== window.location.origin || url.hash !== "") {
		return;
	}

	const targetPath = getNavigationPath(url);
	if (targetPath === getNavigationPath(window.location)) {
		return;
	}

	pendingSidebarNavigation = targetPath;
}

export function registerDocsSidebarFocus(onDestinationRendered: () => void): () => void {
	requestFocus = onDestinationRendered;
	document.addEventListener("click", onClick);
	document.addEventListener("keydown", onKeyDown);
	return () => {
		document.removeEventListener("click", onClick);
		document.removeEventListener("keydown", onKeyDown);
		pendingSidebarNavigation = undefined;
		requestFocus = undefined;
	};
}

export const onRouteUpdate: ClientModule["onRouteUpdate"] = ({ location }): void => {
	if (getNavigationPath(location) !== pendingSidebarNavigation || location.hash !== "") {
		pendingSidebarNavigation = undefined;
	}
};

export const onRouteDidUpdate: ClientModule["onRouteDidUpdate"] = ({ location }): void => {
	if (getNavigationPath(location) !== pendingSidebarNavigation) {
		pendingSidebarNavigation = undefined;
		return;
	}

	requestFocus?.();
};

export function focusDocsSidebarDestination(): void {
	const pendingPath = pendingSidebarNavigation;
	pendingSidebarNavigation = undefined;
	if (pendingPath === undefined || getNavigationPath(window.location) !== pendingPath) {
		return;
	}

	const main = document.querySelector("main");
	if (main instanceof HTMLElement) {
		main.tabIndex = -1;
		main.focus({ preventScroll: true });
	}
}
