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
 * Normalizes trailing slashes so sidebar links match router locations.
 */
function getNavigationPath(location: { pathname: string; search: string }): string {
	const path = location.pathname;
	return `${path.length > 1 ? path.replace(/\/+$/u, "") : path}${location.search}`;
}

/**
 * Moves focus to the destination content after keyboard navigation from a documentation sidebar.
 */
export default function Layout(props: Props): ReactElement {
	const history = useHistory();
	const location = useLocation();
	const pendingNavigation = useRef<string | undefined>(undefined);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
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
			// Category expansion has no route change, so cancel its pending focus here.
			if (event.defaultPrevented && link?.getAttribute("href") === "#") {
				pendingNavigation.current = undefined;
			}
		};

		// Cancel superseded navigation even while the next route's content is not ready.
		const unlisten = history.listen((nextLocation) => {
			if (
				getNavigationPath(nextLocation) !== pendingNavigation.current ||
				nextLocation.hash !== ""
			) {
				pendingNavigation.current = undefined;
			}
		});
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
		// Docusaurus updates this location after the destination renders.
		// Descendant effects reset the theme's focus before this wrapper's effect runs.
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
			main.tabIndex = -1;
			main.focus({ preventScroll: true });
		}
	}, [location]);

	return <OriginalLayout {...props} />;
}
