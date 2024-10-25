/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { HomePageSection } from "@site/src/components/homePageSection";

import ServiceSectionBG from "@site/static/assets/home/services-section-background.png";
import ServicesDiagram from "@site/static/assets/home/services-diagram.png";
import MicrosoftLogo from "@site/static/assets/microsoft-logo.png";
import AzureLogo from "@site/static/assets/azure-logo.png";

import "@site/src/css/serviceSection.css";

const afrCardDescription =
	"Azure Fluid Relay is a cloud service that enables real-time collaboration on shared data models. It is a fully managed service that provides a secure, scalable, and reliable way to connect clients to each other and to the data models they share.";

const speCardDescription =
	"Microsoft SharePoint Embedded is a cloud-based file and document management system suitable for use in any application. It is a new API-only solution which enables app developers to harness the power of the Microsoft 365 file and document storage platform for any app, and is suitable for enterprises building line of business applications and ISVs building multi-tenant applications.";

/**
 * Homepage "Services" section component.
 */
export function ServiceSection(): JSX.Element {
	const backgroundStyle: React.CSSProperties = {
		background: `linear-gradient(to bottom, rgba(255, 253, 251, 1) 10%, rgba(255, 253, 251, 0.2)), url(${ServiceSectionBG})`,
		backgroundPosition: "center",
		backgroundRepeat: "no-repeat",
		backgroundSize: "cover",
	};
	return (
		<HomePageSection title="Fluid Framework in the Cloud" backgroundStyle={backgroundStyle}>
			<div className="serviceContentContainer">
				<img
					src={ServicesDiagram}
					alt="Fluid architecture diagram"
					style={{ width: "100%" }}
				/>
				<div className="services">
					<ServiceSectionCard
						logoSource={AzureLogo}
						logoAltText="Microsoft Azure logo"
						title="Azure Fluid Relay"
						description={afrCardDescription}
						learnMoreHref="https://azure.microsoft.com/en-us/products/fluid-relay/#overview"
					/>
					<ServiceSectionCard
						logoSource={MicrosoftLogo}
						logoAltText="Microsoft logo"
						title="Sharepoint Embedded"
						description={speCardDescription}
						learnMoreHref="https://azure.microsoft.com/en-us/products/fluid-relay/#overview"
					/>
				</div>
			</div>
		</HomePageSection>
	);
}

interface ServiceSectionCardProps {
	logoSource: string;
	logoAltText: string;
	title: string;
	description: string;
	learnMoreHref: string;
}

function ServiceSectionCard({
	logoSource,
	logoAltText,
	title,
	description,
	learnMoreHref,
}: ServiceSectionCardProps): React.ReactElement {
	return (
		<div className="service">
			{/*SPE*/}
			<div className="serviceContent">
				<img src={logoSource} className="logo" alt={logoAltText} />
				<div className="serviceTitle">{title}</div>
				<div className="serviceDescription">{description}</div>
				<a
					className="learnMore"
					href={learnMoreHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					Learn more
				</a>
			</div>
		</div>
	);
}
