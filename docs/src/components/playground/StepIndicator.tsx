/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

/**
 * {@link StepIndicator} component props.
 */
export interface StepIndicatorProps {
	/**
	 * Current step index (0-based).
	 */
	currentStep: number;

	/**
	 * Total number of steps.
	 */
	totalSteps: number;

	/**
	 * Set of step indices that have been completed.
	 */
	completedSteps?: Set<number>;
}

/**
 * Renders a step progress indicator bar.
 */
export function StepIndicator({
	currentStep,
	totalSteps,
	completedSteps,
}: StepIndicatorProps): React.ReactElement {
	return (
		<div className="ffcom-playground-step-indicator">
			<span className="ffcom-playground-step-text">
				Step {currentStep + 1} of {totalSteps}
			</span>
			<div className="ffcom-playground-step-bar">
				{Array.from({ length: totalSteps }, (_, i) => (
					<div
						key={i}
						className={`ffcom-playground-step-dot ${
							i === currentStep
								? "ffcom-playground-step-active"
								: completedSteps?.has(i)
									? "ffcom-playground-step-done"
									: ""
						}`}
					/>
				))}
			</div>
		</div>
	);
}
