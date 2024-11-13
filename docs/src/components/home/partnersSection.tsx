/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { PageSection } from "./pageSection";

import AutodeskLogo from "@site/static/assets/autodesk-logo.png";
import HexagonLogo from "@site/static/assets/hexagon-logo.png";
import LoopLogo from "@site/static/assets/loop-logo.svg";
import PowerAppsLogo from "@site/static/assets/power-apps-logo.png";
import TeamsLogo from "@site/static/assets/teams-logo.png";
import WhiteboardLogo from "@site/static/assets/whiteboard-logo.png";

import "@site/src/css/home/partnersSection.css";

// TODO: replace with real content for each partner section once we have gotten agreement on language.
const bodyTextPlaceholder = "";

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
						icon={<img src={AutodeskLogo} title="Autodesk" />}
						labelText="Autodesk"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={autodeskLink}
					/>
					<PartnerEntry
						icon={<img src={HexagonLogo} title="Hexagon" />}
						labelText="Hexagon"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={hexagonLink}
					/>
					<PartnerEntry
						icon={<LoopLogo title="Microsoft Loop" />}
						labelText="Microsoft Loop"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={loopLink}
					/>
					<PartnerEntry
						icon={<img src={TeamsLogo} title="Microsoft Teams" />}
						labelText="Microsoft Teams"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={teamsLink}
					/>
					<PartnerEntry
						icon={<img src={PowerAppsLogo} title="Power Apps" />}
						labelText="Power Apps"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={powerAppsLink}
					/>
					<PartnerEntry
						icon={<img src={WhiteboardLogo} title="Whiteboard" />}
						labelText="Whiteboard"
						bodyText={bodyTextPlaceholder}
						learnMoreHref={whiteboardLink}
					/>
				</div>
			</div>
		</PageSection>
	);
}

interface PartnerEntryProps {
	icon: React.Component;
	labelText: string;
	bodyText: string;
	learnMoreHref: string;
}

function PartnerEntry({
	icon,
	labelText,
	learnMoreHref,
	bodyText,
}: PartnerEntryProps): JSX.Element {
	return (
		<div className="ffcom-partner-entry">
			<div className="ffcom-partner-entry-inner">
				<div className="ffcom-partner-entry-icon">{icon}</div>
				<div className="ffcom-partner-entry-body">
					<div className="ffcom-partner-entry-label-container ">
						<div className="ffcom-partner-entry-label-container-inner">
							<div className="ffcom-partner-entry-label-indicator-container">
								<div className="ffcom-partner-entry-label-indicator-shape" />
							</div>
							<p className="ffcom-partner-entry-label-text">{labelText}</p>
						</div>
					</div>
					<p className="ffcom-partner-entry-description-text ">{bodyText}</p>
					<div className="ffcom-partner-entry-learn-more-container ">
						<div className="ffcom-partner-entry-learn-more-container-inner">
							<a
								className="ffcom-partner-entry-learn-more-text"
								href={learnMoreHref}
								target="_blank"
								rel="noreferrer"
							>
								Learn more
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
