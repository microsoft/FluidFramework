/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useDoc } from "@docusaurus/plugin-content-docs/client";
import { ThemeClassNames } from "@docusaurus/theme-common";
import Heading from "@theme/Heading";
import MDXContent from "@theme/MDXContent";
import clsx from "clsx";
import type { ReactElement, ReactNode } from "react";

function useSyntheticTitle(): string | undefined {
	const { metadata, frontMatter, contentTitle } = useDoc();
	return frontMatter.hide_title === true || contentTitle !== undefined
		? undefined
		: metadata.title;
}

/**
 * Renders documentation content with a Pagefind weight that favors the current version.
 */
export default function DocItemContent({ children }: { children: ReactNode }): ReactElement {
	const { metadata } = useDoc();
	const syntheticTitle = useSyntheticTitle();
	const pagefindWeight = metadata.version === "current" ? 10 : 0.1;

	return (
		<div
			className={clsx(ThemeClassNames.docs.docMarkdown, "markdown")}
			data-pagefind-weight={pagefindWeight}
		>
			{syntheticTitle !== undefined && (
				<header>
					<Heading as="h1">{syntheticTitle}</Heading>
				</header>
			)}
			<MDXContent>{children}</MDXContent>
		</div>
	);
}
