/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useEffect, useReducer } from "react";
import type { PropsWithChildren, ReactElement } from "react";

import {
	focusDocsSidebarDestination,
	registerDocsSidebarFocus,
} from "@site/src/clientModules/docsSidebarFocus";

export type RootProps = PropsWithChildren;

/**
 * Root component of Docusaurus's React tree.
 * Guaranteed to never unmount.
 *
 * @see {@link https://docusaurus.io/docs/swizzling#wrapper-your-site-with-root}
 */
export default function Root({ children }: RootProps): ReactElement {
	// Connect the route callback to a separate root render so the focus effect runs after the theme resets focus.
	const [focusRequest, requestFocus] = useReducer((value: number) => value + 1, 0);
	useEffect(() => registerDocsSidebarFocus(requestFocus), [requestFocus]);
	useEffect(focusDocsSidebarDestination, [focusRequest]);
	return <>{children}</>;
}
