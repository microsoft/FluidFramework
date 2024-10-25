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
		<div className="keyFeaturesCardGrid">
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
		<div className="keyFeatureCard">
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
		<div className="keyFeatureCardImageContainer">
			<img src={props.src} alt={props.alt} className="keyFeatureCardImage" />
		</div>
	);
}

function KeyFeatureCardContents(props: { label: string; text: string; href: string }): JSX.Element {
	return (
		<div className="keyFeatureCardContents">
			<KeyFeatureCardBody label={props.label} text={props.text} />
			<KeyFeatureCardFooter href={props.href} />
		</div>
	);
}

function KeyFeatureCardBody(props: { label: string; text: string }): JSX.Element {
	return (
		<div className="keyFeatureCardBody">
			<div className="keyFeatureCardBodyLabelContainer">
				<p className="keyFeatureCardBodyLabel">{props.label}</p>
			</div>
			<div className="keyFeatureCardBodyTextContainer">
				<p className="keyFeatureCardBodyText">{props.text}</p>
			</div>
		</div>
	);
}

function KeyFeatureCardFooter(props: { href: string }): JSX.Element {
	return (
		<div className="keyFeatureCardFooter">
			<div className="keyFeatureCardFooterContent">
				<div className="keyFeatureCardFooterLink">
					<div className="keyFeatureCardFooterLinkButton">{">"}</div>
					<div className="keyFeatureCardFooterLinkLabelFrame">
						<a className="keyFeatureCardFooterLinkLabelText" href={props.href}>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
