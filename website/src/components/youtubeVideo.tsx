/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Element } from "react";

import "@site/src/css/youtubeVideo.css";

/**
 * {@link YoutubeVideo} component props.
 */
export interface YoutubeVideoProps {
	/**
	 * Embed ID of the YouTube video.
	 */
	videoId: string;

	/**
	 * Title of the YouTube video.
	 */
	title: string;

	/**
	 * Optional class name to apply to the video container.
	 */
	className?: string;
}

/**
 * Renders a YouTube video, utilizing `youtube-nocookie.com` to ensure our privacy requirements are being met (i.e., no cookies).
 */
export function YoutubeVideo({ className, title, videoId }: YoutubeVideoProps): Element {
	const videoSourceUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
	const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
	return (
		<div className={className}>
			<div className="ffcom-rounded-video">
				<a className="ffcom-video-title" href={videoPageUrl}>
					{title}
				</a>
				<iframe
					width="100%"
					height="100%"
					src={videoSourceUrl}
					title={title}
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					referrerPolicy="strict-origin-when-cross-origin"
					allowFullScreen
				></iframe>
			</div>
		</div>
	);
}
