/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * Root component of Docusaurus's React tree.
 * Guaranteed to never unmount.
 *
 * @see {@link https://docusaurus.io/docs/swizzling#wrapper-your-site-with-root}
 */
export default function Root({ children }) {
	return <>{children}</>;
}
