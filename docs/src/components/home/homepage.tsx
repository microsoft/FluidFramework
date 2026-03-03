/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactElement } from "react";

import { Banner } from "./banner";
import { HowItWorksSection } from "./howItWorksSection";
import { KeyFeaturesSection } from "./keyFeaturesSection";
import { PartnersSection } from "./partnersSection";
import { ServiceSection } from "./serviceSection";

import "@site/src/css/home/homepage.css";

/**
 * Root homepage component.
 */
export function Homepage(): ReactElement {
	return (
		<div className="ffcom-homepage">
			<Banner />
			<div className="ffcom-homepage-body">
				<KeyFeaturesSection />
				<PartnersSection />
				<HowItWorksSection />
				<ServiceSection />
			</div>
		</div>
	);
}
