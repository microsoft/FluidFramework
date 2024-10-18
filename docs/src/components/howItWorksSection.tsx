/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { HomePageSection } from '@site/src/components/homePageSection';

import "@site/src/css/howItWorksSection.css";

export function HowItWorksSection(): React.ReactElement {
	return <HomePageSection title="See how it works" subtitle="Open Source">
		<div className="howItWorksSectionBody">
			<div className="howItWorksSectionCodeBody">
				<div className="howItWorksCodeColumn">
					<div className="howItWorksCodeColumnLabel">
						Sample Code
					</div>
					<div className="howItWorksCodeCard">
						<div className="howItWorksCodeCardFrame">
							<div className="howItWorksCodeCardBody">
								<p className="howItWorksCodeCardText">
									Code
								</p>
							</div>
						</div>
					</div>
				</div>
				<div className="howItWorksCodeColumn">
					<div className="howItWorksCodeColumnLabel">
						Sample Output
					</div>
					<div className="howItWorksCodeCard">
						<div className="howItWorksCodeCardFrame">
							<div className="howItWorksCodeCardBody">
								Foo
							</div>
						</div>
					</div>
					<div className="howItWorksCodeCard">
						<div className="howItWorksCodeCardFrame">
							<div className="howItWorksCodeCardBody">
								Bar
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="howItWorksTryOtherSamplesButton">
				<div className="howItWorksTryOtherSamplesButtonFrame">
					<label className="howItWorksTryOtherSamplesButtonLabel">Try the other samples</label>
				</div>
			</div>
		</div>
	</HomePageSection>;
}
