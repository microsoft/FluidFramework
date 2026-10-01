/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useHistory, useLocation } from "@docusaurus/router";
import { ThemeClassNames } from "@docusaurus/theme-common";
import type { Props } from "@theme/Layout";
import OriginalLayout from "@theme-original/Layout";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

const docsSidebarLinkSelector = `.${ThemeClassNames.docs.docSidebarMenu} a.menu__link[href]`;

/**
 * Returns a path and query string for destination comparisons.
 *
 * @remarks
 * Ignores trailing slashes so sidebar links match browser and router locations.
 * This function returns a new string. It does not change link URLs or location objects.
 */
function getNavigationPath(location: { pathname: string; search: string }): string {
	const path = location.pathname;
	return `${path.length > 1 ? path.replace(/\/+$/u, "") : path}${location.search}`;
}

/**
 * Wraps the Docusaurus classic theme's page layout.
 *
 * @remarks
 * This wrapper renders `@theme-original/Layout`.
 * It does not contain an ejected copy of the theme implementation.
 *
 * After keyboard navigation from a documentation sidebar, this wrapper moves focus to the destination's main content.
 * The focus logic depends on Docusaurus's sidebar markup and the order of React effects.
 * After a Docusaurus upgrade, check this behavior with the sidebar tests in `Nav.spec.ts`.
 *
 * @see {@link https://docusaurus.io/docs/swizzling/ | Docusaurus swizzling}
 */
export default function Layout(props: Props): ReactElement {
	const history = useHistory();
	const location = useLocation();
	const pendingNavigation = useRef<string | undefined>(undefined);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			// Only an unmodified Enter press requests focus. Leave other keyboard actions unchanged.
			if (
				event.key !== "Enter" ||
				event.defaultPrevented ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.shiftKey ||
				!(event.target instanceof Element)
			) {
				return;
			}

			const link = event.target.closest<HTMLAnchorElement>(docsSidebarLinkSelector);
			if (
				link === null ||
				link.getAttribute("href") === "#" ||
				link.origin !== window.location.origin ||
				link.hash !== ""
			) {
				return;
			}

			const targetPath = getNavigationPath(link);
			if (targetPath !== getNavigationPath(window.location)) {
				pendingNavigation.current = targetPath;
			}
		};

		const onClick = (event: MouseEvent): void => {
			if (!(event.target instanceof Element)) {
				return;
			}

			const link = event.target.closest<HTMLAnchorElement>(docsSidebarLinkSelector);
			// Enter also generates a click with detail 0. Keep its pending focus request.
			// A pointer click or category expansion cancels the request, even for the same destination.
			if (
				link !== null &&
				(event.detail > 0 || (event.defaultPrevented && link.getAttribute("href") === "#"))
			) {
				pendingNavigation.current = undefined;
			}
		};

		// History changes before the destination renders.
		// If another route or fragment replaces the destination, cancel the focus request immediately.
		const unlisten = history.listen((nextLocation) => {
			if (
				getNavigationPath(nextLocation) !== pendingNavigation.current ||
				nextLocation.hash !== ""
			) {
				pendingNavigation.current = undefined;
			}
		});
		// Document listeners cover desktop and mobile sidebars, even when Docusaurus replaces their elements.
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("click", onClick);
		return () => {
			unlisten();
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("click", onClick);
			pendingNavigation.current = undefined;
		};
	}, [history]);

	useEffect(() => {
		// Docusaurus keeps this location on the old page until the destination renders.
		// The original layout's effects reset focus first, so this wrapper applies the final focus.
		const pendingPath = pendingNavigation.current;
		pendingNavigation.current = undefined;
		if (
			pendingPath === undefined ||
			getNavigationPath(location) !== pendingPath ||
			getNavigationPath(window.location) !== pendingPath
		) {
			return;
		}

		const main = document.querySelector("main");
		if (main instanceof HTMLElement) {
			// A negative tabIndex permits programmatic focus without an extra Tab stop.
			// preventScroll leaves Docusaurus in control of the scroll position.
			main.tabIndex = -1;
			main.focus({ preventScroll: true });
		}
	}, [location]);

	return <OriginalLayout {...props} />;
}
