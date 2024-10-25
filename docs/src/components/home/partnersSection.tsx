/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { PageSection } from "./pageSection";

import AutodeskLogo from "@site/static/assets/autodesk-logo.png";
import HexagonLogo from "@site/static/assets/hexagon-logo.png";
import LoopLogo from "@site/static/assets/loop-logo.svg";
import TeamsLogo from "@site/static/assets/teams-logo.png";
import PowerAppsLogo from "@site/static/assets/power-apps-logo.png";
import WhiteboardLogo from "@site/static/assets/whiteboard-logo.png";

import "@site/src/css/home/partnersSection.css";

const bodyTextPlaceholder =
	"This is placeholder text. It should be replaced with real contents before this site goes live. Repeat: this is only placeholder text. In the event of real text, you would not be reading this text.";

/**
 * Homepage "Partners" section component.
 */
export function PartnersSection(): JSX.Element {
	return (
		<PageSection title="Who's using Fluid Framework">
			<div className="ffcom-partners-section-contents">
				<div className="ffcom-partners-section-contents-inner">
					<PartnerEntry
						icon={<img src={AutodeskLogo} />}
						labelText="Autodesk"
						bodyText={bodyTextPlaceholder}
					/>
					<PartnerEntry
						icon={<img src={HexagonLogo} />}
						labelText="Hexagon"
						bodyText={bodyTextPlaceholder}
					/>
					<PartnerEntry
						icon={<LoopLogo />}
						labelText="Microsoft Loop"
						bodyText={bodyTextPlaceholder}
					/>
					<PartnerEntry
						icon={<img src={TeamsLogo} />}
						labelText="Microsoft Teams"
						bodyText={bodyTextPlaceholder}
					/>
					<PartnerEntry
						icon={<img src={PowerAppsLogo} />}
						labelText="Power Apps"
						bodyText={bodyTextPlaceholder}
					/>
					<PartnerEntry
						icon={<img src={WhiteboardLogo} />}
						labelText="Whiteboard"
						bodyText={bodyTextPlaceholder}
					/>
				</div>
			</div>
		</PageSection>
	);
}

interface PartnerEntryProps {
	icon: React.Component;
	iconAltText: string;
	labelText: string;
	bodyText: string;
}

// TODO: is this right?
const learnMoreHref = "/docs";

function PartnerEntry({ icon, labelText, bodyText }: PartnerEntryProps): JSX.Element {
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
							<a className="ffcom-partner-entry-learn-more-text" href={learnMoreHref}>
								Learn more
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
