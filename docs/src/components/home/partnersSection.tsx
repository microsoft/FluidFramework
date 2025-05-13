/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { PageSection } from "./pageSection";

import "@site/src/css/home/partnersSection.css";

// TODO: the spec calls for text contents between the title and the footer, but we don't have that text yet.
// Once we have that text, restore the commented out code below and fill in the necessary text.

const autodeskLink = "https://www.autodesk.com/";
const hexagonLink = "https://hexagon.com/";
const loopLink = "https://www.microsoft.com/microsoft-loop";
const powerAppsLink = "https://www.microsoft.com/power-platform/products/power-apps";
const teamsLink = "https://www.microsoft.com/microsoft-teams";
const whiteboardLink = "https://www.microsoft.com/microsoft-365/microsoft-whiteboard";

/**
 * Homepage "Partners" section component.
 */
export function PartnersSection(): JSX.Element {
	return (
		<PageSection title="Who's using Fluid Framework">
			<div className="ffcom-partners-section-contents">
				<div className="ffcom-partners-section-contents-inner">
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/autodesk-logo.png"
								title="Autodesk"
							/>
						}
						title="Autodesk"
						// bodyText={TODO}
						learnMoreHref={autodeskLink}
						learnMoreLinkAltText="Autodesk"
					/>
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/hexagon-logo.png"
								title="Hexagon"
							/>
						}
						title="Hexagon"
						// bodyText={TODO}
						learnMoreHref={hexagonLink}
						learnMoreLinkAltText="Hexagon"
					/>
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/loop-logo.svg"
								title="Microsoft Loop"
							/>
						}
						title="Microsoft Loop"
						// bodyText={TODO}
						learnMoreHref={loopLink}
						learnMoreLinkAltText="Microsoft Loop"
					/>
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/teams-logo.png"
								title="Microsoft Teams"
							/>
						}
						title="Microsoft Teams"
						// bodyText={TODO}
						learnMoreHref={teamsLink}
						learnMoreLinkAltText="Microsoft Teams"
					/>
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/power-apps-logo.png"
								title="Power Apps"
							/>
						}
						title="Power Apps"
						// bodyText={TODO}
						learnMoreHref={powerAppsLink}
						learnMoreLinkAltText="Power Apps"
					/>
					<PartnerEntry
						icon={
							<img
								src="https://storage.fluidframework.com/static/images/website/partner-logos/whiteboard-logo.png"
								title="Whiteboard"
							/>
						}
						title="Whiteboard"
						// bodyText={TODO}
						learnMoreHref={whiteboardLink}
						learnMoreLinkAltText="Whiteboard"
					/>
				</div>
			</div>
		</PageSection>
	);
}

interface PartnerEntryProps {
	icon: React.Component;
	title: string;
	// bodyText: string;
	learnMoreHref: string;
	learnMoreLinkAltText: string;
}

function PartnerEntry({
	icon,
	title,
	learnMoreHref,
	learnMoreLinkAltText,
}: PartnerEntryProps): JSX.Element {
	return (
		<div className="ffcom-partner-entry">
			<div className="ffcom-partner-entry-inner">
				<div className="ffcom-partner-entry-body">
					<PartnerEntryIcon icon={icon} />
					<PartnerEntryLabel title={title} />
					{/* TODO: restore this once we have body text contents: <PartnerEntryBody bodyText={bodyText} /> */}
					<PartnerEntryFooter
						learnMoreHref={learnMoreHref}
						learnMoreLinkAltText={learnMoreLinkAltText}
					/>
				</div>
			</div>
		</div>
	);
}

interface PartnerEntryIconProps {
	icon: React.Component;
}

function PartnerEntryIcon({ icon }: PartnerEntryIconProps): React.ReactElement {
	return <div className="ffcom-partner-entry-icon">{icon}</div>;
}

interface PartnerEntryLabelProps {
	title: string;
}

function PartnerEntryLabel({ title }: PartnerEntryLabelProps): React.ReactElement {
	return (
		<div className="ffcom-partner-entry-label-container ">
			<div className="ffcom-partner-entry-label-container-inner">
				<div className="ffcom-partner-entry-label-indicator-container">
					<div className="ffcom-partner-entry-label-indicator-shape" />
				</div>
				<p className="ffcom-partner-entry-label-text">{title}</p>
			</div>
		</div>
	);
}

// interface PartnerEntryBodyProps {
// 	bodyText: string;
// }

// function PartnerEntryBody({ bodyText }: PartnerEntryBodyProps): React.ReactElement {
// 	return <p className="ffcom-partner-entry-description-text ">{bodyText}</p>;
// }

interface PartnerEntryFooterProps {
	learnMoreHref: string;
	learnMoreLinkAltText: string;
}

function PartnerEntryFooter({
	learnMoreHref,
	learnMoreLinkAltText,
}: PartnerEntryFooterProps): React.ReactElement {
	return (
		<div className="ffcom-partner-entry-learn-more-container ">
			<div className="ffcom-partner-entry-learn-more-container-inner">
				<a
					className="ffcom-partner-entry-learn-more-text"
					href={learnMoreHref}
					target="_blank"
					rel="noreferrer"
					aria-label={learnMoreLinkAltText}
				>
					Learn more
				</a>
			</div>
		</div>
	);
}
