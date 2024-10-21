/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HomePageSection } from '@site/src/components/homePageSection';
import ServiceSectionBG from '@site/static/images/ffInCloudBG.png';

import ServicesDiagram from '@site/static/assets/services-diagram.svg';

import "@site/src/css/serviceSection.css";

export function ServiceSection(): JSX.Element {
	return (
		<HomePageSection title="Fluid Framework in the Cloud" image={ServiceSectionBG}>

			<div className="serviceSectionContainer">
			<div className="overlay"></div>

				<div className="serviceContentContainer">
					<div className="services">
						<ServicesDiagram />
							<div className="service">{/*AFR*/}
								<div className="serviceContent">
										<div className="azureImg"></div>
										<div className="serviceTitle">Azure Fluid Relay</div>
										<div className="serviceDescription">
											Azure Fluid Relay is a cloud service that enables real-time collaboration on shared data models. It is a fully managed service that provides a secure, scalable, and reliable way to connect clients to each other and to the data models they share.
										</div>
										<a className="learnMore" href="https://azure.microsoft.com/en-us/products/fluid-relay/#overview" target="_blank" rel="noopener noreferrer">
										Learn more
									</a>
								</div>
							</div>
							<div className="service">{/*SPE*/}
								<div className="serviceContent">
									<div className="msftLogo"></div>
									<div className="serviceTitle">Sharepoint Embedded</div>
									<div className="serviceDescription">
									Microsoft SharePoint Embedded is a cloud-based file and document management system suitable for use in any application. It is a new API-only solution which enables app developers to harness the power of the Microsoft 365 file and document storage platform for any app, and is suitable for enterprises building line of business applications and ISVs building multi-tenant applications.
									</div>
									<a className="learnMore" href="https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview" target="_blank" rel="noopener noreferrer">
										Learn more
									</a>
								</div>
							</div>
					</div>
				</div>
			</div>
		</HomePageSection>
	);
}
