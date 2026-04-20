/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * {@link ValidationBadge} component props.
 */
export interface ValidationBadgeProps {
	/**
	 * Human-readable label for this check.
	 */
	label: string;

	/**
	 * Whether the check passed.
	 */
	passed: boolean;
}

/**
 * Renders a single validation check with a pass/fail indicator.
 */
export function ValidationBadge({ label, passed }: ValidationBadgeProps): React.ReactElement {
	return (
		<div className="ffcom-playground-validation-item">
			<span
				className={`ffcom-playground-validation-icon ${passed ? "ffcom-playground-validation-pass" : "ffcom-playground-validation-fail"}`}
			>
				{passed ? "\u2713" : "\u2717"}
			</span>
			<span className="ffcom-playground-validation-label">{label}</span>
		</div>
	);
}
