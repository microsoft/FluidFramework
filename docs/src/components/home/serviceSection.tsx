/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { PageSection } from "./pageSection";

import "@site/src/css/home/serviceSection.css";

const servicesDiagramImageSource =
	"https://storage.fluidframework.com/static/images/website/home/services-diagram.png";
const servicesSectionBackgroundImageSource =
	"https://storage.fluidframework.com/static/images/website/home/services-section-background.png";

const afrCardDescription =
	"Azure Fluid Relay is a cloud service that enables real-time collaboration on shared data models. It is a fully managed service that provides a secure, scalable, and reliable way to connect clients to each other and to the data models they share.";

const speCardDescription =
	"Microsoft SharePoint Embedded is a cloud-based file and document management system suitable for use in any application. It is a new API-only solution which enables app developers to harness the power of the Microsoft 365 file and document storage platform for any app, and is suitable for enterprises building line of business applications and ISVs building multi-tenant applications.";

/**
 * Homepage "Services" section component.
 */
export function ServiceSection(): JSX.Element {
	const backgroundStyle: React.CSSProperties = {
		background: `linear-gradient(to bottom, rgba(255, 253, 251, 1) 10%, rgba(255, 253, 251, 0.2)), url(${servicesSectionBackgroundImageSource})`,
		backgroundPosition: "center",
		backgroundRepeat: "no-repeat",
		backgroundSize: "cover",
	};
	return (
		<PageSection title="Fluid Framework in the Cloud" backgroundStyle={backgroundStyle}>
			<div className="ffcom-service-content-container">
				<img
					src={servicesDiagramImageSource}
					alt="Fluid architecture diagram"
					style={{ width: "100%" }}
				/>
				<div className="ffcom-services">
					<ServiceSectionCard
						logoSource="https://storage.fluidframework.com/static/images/website/azure-logo.png"
						logoAltText="Microsoft Azure logo"
						title="Azure Fluid Relay"
						description={afrCardDescription}
						learnMoreHref="https://azure.microsoft.com/en-us/products/fluid-relay/#overview"
						learnMoreLinkAltText="Azure Fluid Relay"
					/>
					<ServiceSectionCard
						logoSource="https://storage.fluidframework.com/static/images/website/microsoft-logo.png"
						logoAltText="Microsoft logo"
						title="SharePoint Embedded"
						description={speCardDescription}
						learnMoreHref="https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview"
						learnMoreLinkAltText="Sharepoint Embedded"
					/>
				</div>
			</div>
		</PageSection>
	);
}

interface ServiceSectionCardProps {
	logoSource: string;
	logoAltText: string;
	title: string;
	description: string;
	learnMoreHref: string;
	learnMoreLinkAltText: string;
}

function ServiceSectionCard({
	logoSource,
	logoAltText,
	title,
	description,
	learnMoreHref,
	learnMoreLinkAltText,
}: ServiceSectionCardProps): React.ReactElement {
	return (
		<div className="ffcom-service">
			<div className="ffcom-service-content">
				<img src={logoSource} className="ffcom-service-card-logo" alt={logoAltText} />
				<div className="ffcom-service-title">{title}</div>
				<div className="ffcom-service-description">{description}</div>
				<a
					className="ffcom-learn-more-link"
					href={learnMoreHref}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={learnMoreLinkAltText}
				>
					Learn more
				</a>
			</div>
		</div>
	);
}
