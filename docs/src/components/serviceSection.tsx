/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HomePageSection } from '@site/src/components/homePageSection';
import ServiceSectionBG from '@site/static/images/ffInCloudBG.png';

import ServicesDiagram from '@site/static/assets/services-diagram.png';

import "@site/src/css/serviceSection.css";

export function ServiceSection(): JSX.Element {
	return (
		<HomePageSection title="Fluid Framework in the Cloud" image={ServiceSectionBG}>
			<div className="serviceContentContainer">
				<img src={ServicesDiagram} style={{width: "100%"}}/>
				<div className="services">
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
									Azure Fluid Relay is a cloud service that enables real-time collaboration on shared data models. It is a fully managed service that provides a secure, scalable, and reliable way to connect clients to each other and to the data models they share.
								</div>
								<a className="learnMore" href="https://azure.microsoft.com/en-us/products/fluid-relay/#overview" target="_blank" rel="noopener noreferrer">
								Learn more
							</a>
						</div>
					</div>
				</div>
			</div>
		</HomePageSection>
	);
}
