/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Element, useEffect, useRef, useState } from "react";

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
 * Renders a YouTube video, utilizing `youtube-nocookie.com` to ensure our privacy requirements are being met (i.e., no cookies).
 */
export function YoutubeVideo({ className, videoId }: YoutubeVideoProps): Element {
	const [isActivated, setIsActivated] = useState(false);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const videoSourceUrl = `https://www.youtube-nocookie.com/embed/${videoId}${
		isActivated === true ? "?autoplay=1" : ""
	}`;

	useEffect(() => {
		if (isActivated === true) {
			iframeRef.current?.focus();
		}
	}, [isActivated]);

	return (
		<div className={className === undefined ? "youtube-video" : `youtube-video ${className}`}>
			<iframe
				ref={iframeRef}
				width="100%"
				height="100%"
				src={videoSourceUrl}
				title="Fluid Framework - Build collaborative apps fast!"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				referrerPolicy="strict-origin-when-cross-origin"
				tabIndex={isActivated === true ? 0 : -1}
				aria-hidden={isActivated !== true}
				allowFullScreen
			></iframe>
			{isActivated === true ? undefined : (
				<button
					className="youtube-video__play-button"
					type="button"
					aria-label="Play Fluid Framework overview video"
					onClick={() => {
						setIsActivated(true);
					}}
				/>
			)}
		</div>
	);
}
