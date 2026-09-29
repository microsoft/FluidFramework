/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ThemeClassNames } from "@docusaurus/theme-common";
import type { ClientModule } from "@docusaurus/types";

/**
 * Matches links in both desktop and narrow-screen documentation menus.
 */
const docsSidebarLinkSelector = `.${ThemeClassNames.docs.docSidebarMenu} a.menu__link[href]`;
/**
 * Destination path and query for the most recent eligible keyboard activation.
 */
let pendingSidebarNavigation: string | undefined;
/**
 * Requests a root render after Docusaurus renders the expected destination.
 */
let requestFocus: (() => void) | undefined;

/**
 * Normalizes trailing slashes so sidebar links match router locations.
 */
function getNavigationPath(location: { pathname: string; search: string }): string {
	const path = location.pathname;
	return `${path.length > 1 ? path.replace(/\/+$/u, "") : path}${location.search}`;
}

/**
 * Cancels pending focus when the theme handles a sidebar link as category expansion.
 */
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

/**
 * Records unmodified Enter navigation to another same-origin page without a fragment.
 */
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

/**
 * Registers sidebar listeners and the callback that schedules focus through the root component.
 *
 * @remarks
 * Call this from the persistent root component after mount.
 * The callback requests a separate render so the root can apply focus after the theme resets focus.
 *
 * @param onDestinationRendered - Called after Docusaurus renders the expected destination.
 * @returns A cleanup function that removes the listeners and clears the pending destination and callback.
 */
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

/**
 * Cancels pending focus if a route change does not match the expected destination.
 *
 * @remarks
 * Docusaurus calls this before it renders the destination.
 * Fragment navigation keeps the theme's default focus behavior.
 */
export const onRouteUpdate: ClientModule["onRouteUpdate"] = ({ location }): void => {
	if (getNavigationPath(location) !== pendingSidebarNavigation || location.hash !== "") {
		pendingSidebarNavigation = undefined;
	}
};

/**
 * Requests a root render once Docusaurus renders the expected destination.
 *
 * @remarks
 * This callback waits for the destination content, including lazy-loaded routes.
 * The root applies focus in an effect after the theme resets focus.
 */
export const onRouteDidUpdate: ClientModule["onRouteDidUpdate"] = ({ location }): void => {
	if (getNavigationPath(location) !== pendingSidebarNavigation) {
		pendingSidebarNavigation = undefined;
		return;
	}

	requestFocus?.();
};

/**
 * Consumes the pending request and focuses the destination's main content without scrolling.
 *
 * @remarks
 * Call this from the root effect after the route callback requests a render.
 * The destination must still match the current location.
 * The main element receives programmatic focus without an additional Tab stop.
 */
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
