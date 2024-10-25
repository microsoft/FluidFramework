/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/home/banner.css";

const videoSourceUrl = "https://www.youtube.com/embed/uL2nMYk6WTQ";

/**
 * Homepage banner component.
 */
export function Banner(): React.ReactElement {
	return (
		<div className={"ffcom-title-section-container"}>
			<div className="ffcom-root-container">
				<div className="ffcom-content-container">
					<TitleBox />
					<Video />
				</div>
			</div>
		</div>
	);
}

function TitleBox(): React.ReactElement {
	return (
		<div className="ffcom-title-box">
			<h3 className="ffcom-title">Fluid Framework</h3>
			<span className="ffcom-description">
				Empower collaborative innovation with Fluid Framework's seamless,
				high-performance tech stack for real-time applications.
			</span>
		</div>
	);
}

function Video(): React.ReactElement {
	return (
		<div className="ffcom-video-container">
			<iframe
				width="100%"
				height="100%"
				src={videoSourceUrl}
				title="Fluid Framework 2.0 Beta - Build collaborative apps fast!"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				referrerPolicy="strict-origin-when-cross-origin"
				allowFullScreen
			></iframe>
		</div>
	);
}
