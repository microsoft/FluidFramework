/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { TitleSection } from '@site/src/components/TitleSection';
import { KeyFeaturesSection } from "@site/src/components/keyFeaturesSection";
import { PartnersSection } from "@site/src/components/partnersSection";
import { HowItWorksSection } from "@site/src/components/howItWorksSection";
import { ServiceSection } from "@site/src/components/serviceSection";

import "@site/src/css/index.css";


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
				<div className="widthContainer">
					<TitleSection />
					<KeyFeaturesSection />
					<PartnersSection />
					<HowItWorksSection />
					<ServiceSection />
				</div>
		</Layout>
	)
}
