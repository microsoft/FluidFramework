/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useLocation } from "@docusaurus/router";
import { useEffect, useRef, type PropsWithChildren, type ReactElement } from "react";

function normalizePath(path: string): string {
	return path.length > 1 ? path.replace(/\/+$/u, "") : path;
}

function DocsSidebarFocusManager(): ReactElement | undefined {
	const location = useLocation();
	const pendingSidebarNavigationRef = useRef<string | undefined>(undefined);
	const focusTimeoutRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		const onClick = (event: MouseEvent): void => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			const sidebarLink = target.closest<HTMLAnchorElement>(
				"aside.theme-doc-sidebar-container a.menu__link[href]",
			);
			if (sidebarLink === null) {
				return;
			}

			const href = sidebarLink.getAttribute("href");
			if (href === null || !event.defaultPrevented || href !== "#") {
				return;
			}

			pendingSidebarNavigationRef.current = undefined;
			if (focusTimeoutRef.current !== undefined) {
				window.clearTimeout(focusTimeoutRef.current);
				focusTimeoutRef.current = undefined;
			}
		};

		const onKeyDown = (event: KeyboardEvent): void => {
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

			const sidebarLink = target.closest<HTMLAnchorElement>(
				"aside.theme-doc-sidebar-container a.menu__link[href]",
			);
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

			const targetPath = `${normalizePath(url.pathname)}${url.search}`;
			const currentPath = `${normalizePath(window.location.pathname)}${window.location.search}`;
			if (targetPath === currentPath) {
				return;
			}

			if (focusTimeoutRef.current !== undefined) {
				window.clearTimeout(focusTimeoutRef.current);
				focusTimeoutRef.current = undefined;
			}

			pendingSidebarNavigationRef.current = targetPath;
		};

		document.addEventListener("click", onClick);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (focusTimeoutRef.current !== undefined) {
				window.clearTimeout(focusTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (focusTimeoutRef.current !== undefined) {
			window.clearTimeout(focusTimeoutRef.current);
			focusTimeoutRef.current = undefined;
		}

		const pendingPath = pendingSidebarNavigationRef.current;
		if (pendingPath === undefined) {
			return;
		}

		const currentPath = `${normalizePath(location.pathname)}${location.search}`;
		if (currentPath !== pendingPath) {
			pendingSidebarNavigationRef.current = undefined;
			return;
		}

		pendingSidebarNavigationRef.current = undefined;
		const intendedPath = pendingPath;
		focusTimeoutRef.current = window.setTimeout(() => {
			const browserPath = `${normalizePath(window.location.pathname)}${window.location.search}`;
			if (browserPath !== intendedPath) {
				focusTimeoutRef.current = undefined;
				return;
			}

			const main = document.querySelector("main");
			if (!(main instanceof HTMLElement)) {
				focusTimeoutRef.current = undefined;
				return;
			}

			main.tabIndex = -1;
			main.focus({ preventScroll: true });
			focusTimeoutRef.current = undefined;
		}, 50);
	}, [location.pathname, location.search]);

	return;
}

export type RootProps = PropsWithChildren;

/**
 * Root component of Docusaurus's React tree.
 * Guaranteed to never unmount.
 *
 * @see {@link https://docusaurus.io/docs/swizzling#wrapper-your-site-with-root}
 */
export default function Root({ children }: RootProps): ReactElement {
	return (
		<>
			<DocsSidebarFocusManager />
			{children}
		</>
	);
}
