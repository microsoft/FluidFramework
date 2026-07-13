/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useDoc } from "@docusaurus/plugin-content-docs/client";
import OriginalDocItemMetadata from "@theme-original/DocItem/Metadata";
import type { ReactElement } from "react";

/**
 * Adds the documentation version to Pagefind result metadata.
 */
export default function DocItemMetadata(): ReactElement {
	const { metadata } = useDoc();
	const version = metadata.version === "current" ? "v2" : `v${metadata.version}`;

	return (
		<>
			<OriginalDocItemMetadata />
			<meta data-pagefind-meta={`version:${version}`} />
		</>
	);
}
