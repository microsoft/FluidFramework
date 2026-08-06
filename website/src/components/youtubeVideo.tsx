/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useState, type ReactElement } from "react";

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
	 * Optional class name to apply to the video container.
	 */
	className?: string;
}

/**
 * Renders an accessible click-to-load YouTube façade.
 *
 * The YouTube iframe is only mounted after the user activates the poster button. This keeps
 * YouTube's internal markup out of automated accessibility scans at rest, improves initial page
 * performance, and still uses `youtube-nocookie.com` for the loaded player to meet our privacy
 * requirements (i.e., no cookies).
 */
export function YoutubeVideo({ className, videoId }: YoutubeVideoProps): ReactElement {
	const [isVideoLoaded, setIsVideoLoaded] = useState(false);
	const title = "Fluid Framework - Build collaborative apps fast!";
	const videoSourceUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
	// hqdefault.jpg is available for every YouTube video; i.ytimg.com serves thumbnails
	// without cookies.
	const posterSourceUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

	return (
		<div className={className}>
			<div className="ffcom-rounded-video">
				{isVideoLoaded === true ? (
					<iframe
						width="100%"
						height="100%"
						src={videoSourceUrl}
						title={title}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						referrerPolicy="strict-origin-when-cross-origin"
						allowFullScreen
					></iframe>
				) : (
					<button
						type="button"
						className="ffcom-youtube-facade"
						aria-label={`Play video: ${title}`}
						onClick={() => {
							setIsVideoLoaded(true);
						}}
					>
						{/* The button's aria-label names the action; the thumbnail is decorative context. */}
						<img className="ffcom-youtube-facade-poster" src={posterSourceUrl} alt="" />
						<span className="ffcom-youtube-facade-play-icon"></span>
					</button>
				)}
			</div>
		</div>
	);
}
