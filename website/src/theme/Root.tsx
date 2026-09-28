/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useEffect, useReducer, type PropsWithChildren, type ReactElement } from "react";

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
	const [focusRequest, requestFocus] = useReducer((value: number) => value + 1, 0);
	useEffect(() => registerDocsSidebarFocus(requestFocus), [requestFocus]);
	// Apply focus after the theme's route effects reset it.
	useEffect(focusDocsSidebarDestination, [focusRequest]);
	return <>{children}</>;
}
