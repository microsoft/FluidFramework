/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { HomePageBanner } from "@site/src/components/homePageBanner";
import { KeyFeaturesSection } from "@site/src/components/keyFeaturesSection";
import { PartnersSection } from "@site/src/components/partnersSection";
import { HowItWorksSection } from "@site/src/components/howItWorksSection";
import { ServiceSection } from "@site/src/components/serviceSection";

import "@site/src/css/homepage.css";

/**
 * Root homepage component.
 */
export function Homepage(): React.ReactElement {
	return (
		<div className="ffcom_homepage">
			<HomePageBanner />
			<div className="ffcom_homepage_body">
				<KeyFeaturesSection />
				<PartnersSection />
				<HowItWorksSection />
				<ServiceSection />
			</div>
		</div>
	);
}
