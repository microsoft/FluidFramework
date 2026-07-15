/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useDocsVersion } from "@docusaurus/plugin-content-docs/client";
import OriginalDocItemMetadata from "@theme-original/DocItem/Metadata";
import type { ReactElement } from "react";

/**
 * Adds the documentation version to Pagefind result metadata.
 */
export default function DocItemMetadata(): ReactElement {
	const { label } = useDocsVersion();

	return (
		<>
			<OriginalDocItemMetadata />
			<meta data-pagefind-meta={`version:${label}`} />
		</>
	);
}
