/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * {@link YoutubeVideo} component props.
 */
export interface YoutubeVideoProps {
	/**
	 * Embed ID of the YouTube video.
	 */
	videoId: string;

	/**
	 * Optional class name to apply to the video container.
	 */
	className?: string;
}

/**
 * Renders a YouTube video, utilizing `youtube-nocookie.com` to ensure our privacy requirements are being met (i.e., no cookies).
 */
export function YoutubeVideo({ className, videoId }: YoutubeVideoProps): React.Element {
	const videoSourceUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
	return (
		<div className={className}>
			<iframe
				width="100%"
				height="100%"
				src={videoSourceUrl}
				title="Fluid Framework - Build collaborative apps fast!"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				referrerPolicy="strict-origin-when-cross-origin"
				allowFullScreen
			></iframe>
		</div>
	);
}
