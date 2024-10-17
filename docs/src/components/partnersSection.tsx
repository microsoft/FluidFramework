/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import "@site/src/css/partnersSection.css";
import { HomePageSection } from '@site/src/components/homePageSection';

import AutodeskLogo from '@site/static/assets/autodesk-logo.png';
import HexagonLogo from '@site/static/assets/hexagon-logo.png';
import LoopLogo from '@site/static/assets/loop-logo.svg';
import TeamsLogo from '@site/static/assets/teams-logo.png';
import PowerAppsLogo from '@site/static/assets/power-apps-logo.png';
import WhiteboardLogo from '@site/static/assets/whiteboard-logo.png';

const bodyTextPlaceholder = "This is placeholder text. It should be replaced with real contents before this site goes live. Repeat: this is only placeholder text. In the event of real text, you would not be reading this text.";

export function PartnersSection(): JSX.Element {
	return <HomePageSection title="Who's using Fluid Framework">
		<div className="partnersSectionContents">
			<div className="partnersSectionContentsInner">
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
	</HomePageSection>;
}

interface PartnerEntryProps {
	icon: React.Component;
	iconAltText: string;
	labelText: string;
	bodyText: string;
}

// TODO: is this right?
const learnMoreHref = "/docs";

function PartnerEntry({icon, labelText, bodyText}: PartnerEntryProps): JSX.Element {
	return <div className="partnerEntry">
		<div className="partnerEntryInner">
			<div className="partnerEntryIcon">
				{icon}
			</div>
			<div className="partnerEntryBody">
				<div className="partnerEntryLabelContainer">
					<div className="partnerEntryLabelContainerInner">
						<div className="partnerEntryLabelIndicatorContainer">
							<div className="partnerEntryLabelIndicatorShape" />
						</div>
						<p className="partnerEntryLabelText">
							{ labelText }
						</p>
					</div>
				</div>
				<p className="partnerEntryDescriptionText">
					{bodyText}
				</p>
				<div className="partnerEntryLearnMoreContainer">
					<div className="partnerEntryLearnMoreContainerInner">
						<a className="partnerEntryLearnMoreText" href={learnMoreHref}>
							Learn more
						</a>
					</div>
				</div>
			</div>
		</div>
	</div>;
}
