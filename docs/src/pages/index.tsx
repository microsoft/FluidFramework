/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import { Homepage } from "@site/src/components/homepage";

// TODO: ideally the sections should be aligned horizontally.
// Currently, each is centered and scales independently.

/**
 * The website homepage.
 */
export default function(): React.ReactElement {
	const {siteConfig} = useDocusaurusContext();
	return (
		<Layout
			title={`Hello from ${siteConfig.title}`}
			description="Description will go into a meta tag in <head />">
			<Homepage />
		</Layout>
	)
}
