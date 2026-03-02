/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import type { ReactElement } from "react";

import "@site/src/css/notFound.css";

export default function NotFound(): ReactElement {
	return (
		<Layout title="404 - Page Not Found">
			<main className="ffcom-not-found">
				<p className="ffcom-not-found-code">404</p>
				<h1 className="ffcom-not-found-title">Page Not Found</h1>
				<p className="ffcom-not-found-description">
					The page you are looking for does not exist. Please check the URL and try again.
				</p>
				<Link className="ffcom-not-found-link" to="/">
					Back to Home
				</Link>
			</main>
		</Layout>
	);
}
