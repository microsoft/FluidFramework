/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { YoutubeVideo } from "@site/src/components/youtubeVideo";

import "@site/src/css/home/banner.css";

const videoEmbedId = "fjRfTdIYzWg";

/**
 * Homepage banner component.
 */
export function Banner(): React.ReactElement {
	return (
		<div className="ffcom-banner">
			<div className="ffcom-banner-inner">
				<TitleBox />
				<YoutubeVideo videoId={videoEmbedId} className="ffcom-video-container" />
			</div>
		</div>
	);
}

const titleBoxDescriptionText =
	"Empower collaborative innovation with Fluid Framework's seamless, high-performance tech stack for real-time applications.";

function TitleBox(): React.ReactElement {
	return (
		<div className="ffcom-title-box">
			<h1 className="ffcom-title">Fluid Framework</h1>
			<span className="ffcom-description">{titleBoxDescriptionText}</span>
		</div>
	);
}
