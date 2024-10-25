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
	footerHref: string;
}

/**
 * Key feature card component.
 */
export function KeyFeatureCard({
	imageSrc,
	imageAltText,
	bodyLabel,
	bodyText,
	footerHref,
}: KeyFeatureCardProps): JSX.Element {
	return (
		<div className="ffcom-key-feature-card">
			<KeyFeatureImage src={imageSrc} alt={imageAltText} />
			<KeyFeatureCardContents label={bodyLabel} text={bodyText} href={footerHref} />
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
						<a
							className="ffcom-key-feature-card-footer-link-label-text"
							href={props.href}
						>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
