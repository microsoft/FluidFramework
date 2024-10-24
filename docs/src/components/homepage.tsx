/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { TitleSection } from "@site/src/components/TitleSection";
import { KeyFeaturesSection } from "@site/src/components/keyFeaturesSection";
import { PartnersSection } from "@site/src/components/partnersSection";
import { HowItWorksSection } from "@site/src/components/howItWorksSection";
import { ServiceSection } from "@site/src/components/serviceSection";

import "@site/src/css/homepage.css";

export function Homepage(): React.ReactElement {
	return (
		<div className="ffcom_homepage">
			<TitleSection />
			<div className="ffcom_homepage_body">
				<KeyFeaturesSection />
				<PartnersSection />
				<HowItWorksSection />
				<ServiceSection />
			</div>
		</div>
	);
}
