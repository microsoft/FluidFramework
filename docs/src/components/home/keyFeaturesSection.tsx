/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { KeyFeatureCard } from "./keyFeatureCard";
import { PageSection } from "./pageSection";

import "@site/src/css/home/keyFeaturesSection.css";

const easyToUseText =
	"Transform your collaborative experience with our developer friendly framework - where simplicity meets powerful functionality effortlessly. The framework provides usability that drives innovation within Microsoft and across the industry by dramatically lowering the difficulty and cost of building innovative, collaborative software.";

const openSourceText =
	"We believe that an open, inclusive, and respectful community will help shape a better future for this project. That's why Fluid Framework is made available for FREE as an Open Source project under the MIT license.";

const performanceText =
	"Unleash unparalleled speed and performance with our cutting-edge solution for building real-time collaborative applications. Collaborative features are only successful if they are fast, scale to large data and user bases. Fluid offers an approachable programming model that leverages mainstream web technology while delivering best-in-class performance.";

/**
 * Homepage "Key Features" section component.
 */
export function KeyFeaturesSection(): JSX.Element {
	return (
		<PageSection title="Start building with Fluid Framework" subtitle="Key Features">
			<KeyFeaturesCardGrid />
		</PageSection>
	);
}

function KeyFeaturesCardGrid(): JSX.Element {
	return (
		<div className="ffcom-key-features-card-grid">
			<KeyFeatureCard
				imageSrc="https://storage.fluidframework.com/static/images/website/home/easy-to-use.png"
				imageAltText="Easy to use"
				bodyLabel="Easy to use"
				bodyText={easyToUseText}
				learnMoreLinkHref="/docs/start/quick-start"
				learnMoreLinkAltText="Fluid Framework Quick Start"
			/>
			<KeyFeatureCard
				imageSrc="https://storage.fluidframework.com/static/images/website/home/open-source.png"
				imageAltText="Open source"
				bodyLabel="Open Source"
				bodyText={openSourceText}
				learnMoreLinkHref="/community"
				learnMoreLinkAltText="Community"
			/>
			<KeyFeatureCard
				imageSrc="https://storage.fluidframework.com/static/images/website/home/performance.png"
				imageAltText="Industry-leading speed and performance"
				bodyLabel="Industry-leading speed & performance"
				bodyText={performanceText}
				learnMoreLinkHref="/docs/build/dds#performance-characteristics"
				learnMoreLinkAltText="Performance"
			/>
		</div>
	);
}
