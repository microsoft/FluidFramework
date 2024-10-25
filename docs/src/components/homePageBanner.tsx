/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/homePageBanner.css";

/**
 * Homepage title component.
 */
export function HomePageBanner(): React.ReactElement {
	return (
		<div className={"ffcom-title-section-container"}>
			<div className="ffcom-root-container">
				<div className="ffcom-content-container">
					<div className="ffcom-title-box">
						<h3 className="ffcom-title">Fluid Framework</h3>
						<span className="ffcom-description">
							Empower collaborative innovation with Fluid Framework's seamless,
							high-performance tech stack for real-time applications.
						</span>
					</div>
					<div className="ffcom-video-container">
						<div className="ffcom-rounded-video">
							<iframe
								width="100%"
								height="100%"
								src="https://www.youtube.com/embed/uL2nMYk6WTQ"
								title="Fluid Framework 2.0 Beta - Build collaborative apps fast!"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
								referrerPolicy="strict-origin-when-cross-origin"
								allowFullScreen
							></iframe>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
