/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useDoc, useDocsVersion } from "@docusaurus/plugin-content-docs/client";
import OriginalDocItemMetadata from "@theme-original/DocItem/Metadata";
import type { ReactElement } from "react";

const apiItemTitlePattern =
	/^(?<name>.+) (?:Class|Enum|Function|Interface|Namespace|TypeAlias|Variable)$/u;

function getApiItemName(title: string, permalink: string): string | undefined {
	if (!permalink.includes("/docs/api/")) {
		return undefined;
	}

	return apiItemTitlePattern.exec(title)?.groups?.name;
}

/**
 * Adds documentation-specific Pagefind result metadata.
 */
export default function DocItemMetadata(): ReactElement {
	const { label } = useDocsVersion();
	const { metadata } = useDoc();
	const apiItemName = getApiItemName(metadata.title, metadata.permalink);

	return (
		<>
			<OriginalDocItemMetadata />
			<meta data-pagefind-meta={`version:${label}`} />
			{apiItemName !== undefined && (
				<meta data-pagefind-meta={`api_item_name:${apiItemName}`} />
			)}
		</>
	);
}
