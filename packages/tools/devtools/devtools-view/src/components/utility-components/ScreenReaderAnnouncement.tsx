/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * {@link ScreenReaderAnnouncement} input props.
 */
export interface ScreenReaderAnnouncementProps {
	/**
	 * The message to announce to screen readers.
	 * When this value changes, screen readers will announce the new content.
	 */
	message: string;
}

/**
 * Visually hidden styles that keep content accessible to screen readers.
 * This follows the standard "sr-only" pattern for accessibility.
 */
const visuallyHiddenStyles: React.CSSProperties = {
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: "0",
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0, 0, 0, 0)",
	whiteSpace: "nowrap",
	border: "0",
};

/**
 * A visually hidden live region that announces status messages to screen readers.
 *
 * @remarks
 * This component creates an ARIA live region that is visually hidden but accessible
 * to assistive technologies. When the `message` prop changes, screen readers will
 * announce the new content without disrupting the visual layout.
 *
 * Use this component to provide status updates for actions like button clicks,
 * form submissions, or data refreshes.
 *
 * @example
 * ```tsx
 * const [status, setStatus] = useState("");
 *
 * function handleClick() {
 *   setStatus("Action completed");
 *   setTimeout(() => setStatus(""), 1000);
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleClick}>Do Action</button>
 *     <ScreenReaderAnnouncement message={status} />
 *   </>
 * );
 * ```
 */
export function ScreenReaderAnnouncement({
	message,
}: ScreenReaderAnnouncementProps): React.ReactElement {
	return (
		<div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyles}>
			{message}
		</div>
	);
}
