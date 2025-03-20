/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/home/keyFeatureCard.css";

/**
 * {@link KeyFeatureCard} component props.
 */
export interface KeyFeatureCardProps {
	imageSrc: string;
	imageAltText: string;
	bodyLabel: string;
	bodyText: string;
	learnMoreLinkHref: string;
	learnMoreLinkAltText: string;
}

/**
 * Key feature card component.
 */
export function KeyFeatureCard({
	imageSrc,
	imageAltText,
	bodyLabel,
	bodyText,
	learnMoreLinkHref,
	learnMoreLinkAltText,
}: KeyFeatureCardProps): JSX.Element {
	return (
		<div className="ffcom-key-feature-card">
			<KeyFeatureImage src={imageSrc} alt={imageAltText} />
			<KeyFeatureCardContents
				label={bodyLabel}
				bodyText={bodyText}
				learnMoreLinkHref={learnMoreLinkHref}
				learnMoreLinkAltText={learnMoreLinkAltText}
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

interface KeyFeatureCardContentsProps {
	label: string;
	bodyText: string;
	learnMoreLinkHref: string;
	learnMoreLinkAltText: string;
}

function KeyFeatureCardContents({
	label,
	bodyText,
	learnMoreLinkHref,
	learnMoreLinkAltText,
}: KeyFeatureCardContentsProps): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-contents">
			<KeyFeatureCardBody label={label} bodyText={bodyText} />
			<KeyFeatureCardFooter
				learnMoreLinkHref={learnMoreLinkHref}
				learnMoreLinkAltText={learnMoreLinkAltText}
			/>
		</div>
	);
}

interface KeyFeatureCardBodyProps {
	label: string;
	bodyText: string;
}

function KeyFeatureCardBody({ label, bodyText }: KeyFeatureCardBodyProps): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-body ">
			<div className="ffcom-key-feature-card-body-label-container">
				<p className="ffcom-key-feature-card-body-label">{label}</p>
			</div>
			<div className="ffcom-key-feature-card-body-text-container">
				<p className="ffcom-key-feature-card-body-text">{bodyText}</p>
			</div>
		</div>
	);
}

interface KeyFeatureCardFooterProps {
	learnMoreLinkHref: string;
	learnMoreLinkAltText: string;
}

function KeyFeatureCardFooter({
	learnMoreLinkHref,
	learnMoreLinkAltText,
}: KeyFeatureCardFooterProps): JSX.Element {
	return (
		<div className="ffcom-key-feature-card-footer">
			<div className="ffcom-key-feature-card-footer-content">
				<div className="ffcom-key-feature-card-footer-link">
					<div className="ffcom-key-feature-card-footer-link-button">{">"}</div>
					<div className="ffcom-key-feature-card-footer-link-label-frame">
						<a
							className="ffcom-key-feature-card-footer-link-label-text"
							href={learnMoreLinkHref}
							aria-label={learnMoreLinkAltText}
						>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
