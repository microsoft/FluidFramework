/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Layout from "@theme/Layout";
import type { ReactElement } from "react";

// Preserve telemetry initialization without a custom user identifier.
// eslint-disable-next-line import/no-unassigned-import
import "@site/src/appInsights";
import { Homepage } from "@site/src/components/home";

/**
 * The website homepage root (including the header and footer injected by Docusaurus).
 */
export default function Home(): ReactElement {
	return (
		<Layout>
			<main>
				<Homepage />
			</main>
		</Layout>
	);
}
