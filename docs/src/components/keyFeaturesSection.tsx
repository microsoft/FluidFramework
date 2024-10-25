/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HomePageSection } from "@site/src/components/homePageSection";

import EasyToUseImage from "@site/static/assets/home/easy-to-use.png";
import OpenSourecImage from "@site/static/assets/home/open-source.png";
import PerformanceImage from "@site/static/assets/home/performance.png";

import "@site/src/css/keyFeaturesSection.css";

const easyToUseText =
	"Transform your collaborative experience with our developer friendly framework - where simplicity meets powerful functionality effortlessly. The framework provides usability that drives innovation within Microsoft and across the industry by dramatically lowering the difficulty and cost of building innovative, collaborative software.";

const openSourceText =
	"We believe that an open, inclusive, and respectful community will help shape a better future for this project. That's why Fluid Framework is made available for FREE as an Open Source project under the MIT license.";

const performanceText =
	"Unleash unparalleled speed and performance with our cutting-edge solution for building real-time collaborative applications. Collaborative features are only successful if they are fast, scale to large data and user bases. Fluid offers an approachable programming model that leverages mainstream web technology while delivering best-in-class performance.";

export function KeyFeaturesSection(): JSX.Element {
	return (
		<HomePageSection title="Start building with Fluid Framework" subtitle="Key Features">
			<KeyFeaturesCardGrid />
		</HomePageSection>
	);
}

function KeyFeaturesCardGrid(): JSX.Element {
	return (
		<div className="ffcom-key-features-card-grid">
			<KeyFeatureCard
				imageSrc={EasyToUseImage}
				imageAltText="Easy to use"
				bodyLabel="Easy to use"
				bodyText={easyToUseText}
				footerHref="/docs"
			/>
			<KeyFeatureCard
				imageSrc={OpenSourecImage}
				imageAltText="Open source"
				bodyLabel="Open Source"
				bodyText={openSourceText}
				footerHref="/docs"
			/>
			<KeyFeatureCard
				imageSrc={PerformanceImage}
				imageAltText="Industry-leading speed and performance"
				bodyLabel="Industry-leading speed & performance"
				bodyText={performanceText}
				footerHref="/docs"
			/>
		</div>
	);
}

function KeyFeatureCard(props: {
	imageSrc: string;
	imageAltText: string;
	bodyLabel: string;
	bodyText: string;
	footerHref: string;
}): JSX.Element {
	return (
		<div className="ffcom-key-feature-card">
			<KeyFeatureImage src={props.imageSrc} alt={props.imageAltText} />
			<KeyFeatureCardContents
				label={props.bodyLabel}
				text={props.bodyText}
				href={props.footerHref}
			/>
		</div>
	);
}

function KeyFeatureImage(props: { src: string; alt: string }): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-image-container">
			<img src={props.src} alt={props.alt} className="ffcom-key-feature-card-image" />
		</div>
	);
}

function KeyFeatureCardContents(props: { label: string; text: string; href: string }): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-contents">
			<KeyFeatureCardBody label={props.label} text={props.text} />
			<KeyFeatureCardFooter href={props.href} />
		</div>
	);
}

function KeyFeatureCardBody(props: { label: string; text: string }): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-body ">
			<div className="ffcom-key-feature-card-body-label-container">
				<p className="ffcom-key-feature-card-body-label">{props.label}</p>
			</div>
			<div className="ffcom-key-feature-card-body-text-container">
				<p className="ffcom-key-feature-card-body-text">{props.text}</p>
			</div>
		</div>
	);
}

function KeyFeatureCardFooter(props: { href: string }): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-footer">
			<div className="ffcom-key-feature-card-footer-content">
				<div className="ffcom-key-feature-card-footer-link">
					<div className="ffcom-key-feature-card-footer-link-button">{">"}</div>
					<div className="ffcom-key-feature-card-footer-link-label-frame">
						<a className="ffcom-key-feature-card-footer-link-label-text" href={props.href}>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
