/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { StepIndicator } from "./StepIndicator";
import { ValidationBadge } from "./ValidationBadge";
import type { TutorialStep } from "./data/types";

/**
 * {@link StepGuide} component props.
 */
export interface StepGuideProps {
	/**
	 * The current tutorial step.
	 */
	step: TutorialStep;

	/**
	 * Current step index (0-based).
	 */
	currentStepIndex: number;

	/**
	 * Total number of steps in the module.
	 */
	totalSteps: number;

	/**
	 * Validation results for each pattern (parallel array to step.validationPatterns).
	 */
	validationResults: boolean[];

	/**
	 * Whether the solution is currently shown.
	 */
	showSolution: boolean;

	/**
	 * Callback when user navigates to a step.
	 */
	onNavigate: (stepIndex: number) => void;

	/**
	 * Callback to toggle showing the solution.
	 */
	onToggleSolution: () => void;

	/**
	 * Callback to go back to module selection.
	 */
	onBackToModules: () => void;
}

/**
 * Renders the step instructions, hints, validation checklist, and navigation.
 */
export function StepGuide({
	step,
	currentStepIndex,
	totalSteps,
	validationResults,
	showSolution,
	onNavigate,
	onToggleSolution,
	onBackToModules,
}: StepGuideProps): React.ReactElement {
	const [expandedHints, setExpandedHints] = React.useState<Set<number>>(new Set());

	const toggleHint = (index: number): void => {
		setExpandedHints((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	// Reset expanded hints when step changes
	React.useEffect(() => {
		setExpandedHints(new Set());
	}, [step.id]);

	const allPassed = validationResults.length > 0 && validationResults.every(Boolean);

	return (
		<div className="ffcom-playground-guide">
			<StepIndicator currentStep={currentStepIndex} totalSteps={totalSteps} />

			<h3 className="ffcom-playground-step-title">{step.title}</h3>
			<p className="ffcom-playground-step-description">{step.description}</p>

			{step.hints.length > 0 && (
				<div className="ffcom-playground-hints">
					<h4 className="ffcom-playground-hints-title">Hints</h4>
					{step.hints.map((hint, i) => (
						<div key={i} className="ffcom-playground-hint">
							<button
								className="ffcom-playground-hint-toggle"
								onClick={() => toggleHint(i)}
								aria-expanded={expandedHints.has(i)}
							>
								<span className="ffcom-playground-hint-arrow">
									{expandedHints.has(i) ? "\u25BC" : "\u25B6"}
								</span>
								Hint {i + 1}
							</button>
							{expandedHints.has(i) && (
								<div className="ffcom-playground-hint-content">
									<code>{hint}</code>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{step.validationPatterns.length > 0 && (
				<div className="ffcom-playground-validation">
					<h4 className="ffcom-playground-validation-title">Checklist</h4>
					{step.validationPatterns.map((pattern, i) => (
						<ValidationBadge
							key={pattern.label}
							label={pattern.label}
							passed={validationResults[i] ?? false}
						/>
					))}
					{allPassed && (
						<div className="ffcom-playground-step-complete">
							All checks passed!
						</div>
					)}
				</div>
			)}

			<div className="ffcom-playground-nav">
				<button
					className="ffcom-playground-nav-button ffcom-playground-nav-secondary"
					onClick={onBackToModules}
				>
					Back to Modules
				</button>

				<div className="ffcom-playground-nav-group">
					{currentStepIndex > 0 && (
						<button
							className="ffcom-playground-nav-button ffcom-playground-nav-secondary"
							onClick={() => onNavigate(currentStepIndex - 1)}
						>
							Previous
						</button>
					)}

					{step.solution !== undefined && (
						<button
							className={`ffcom-playground-nav-button ${showSolution ? "ffcom-playground-nav-active" : "ffcom-playground-nav-secondary"}`}
							onClick={onToggleSolution}
						>
							{showSolution ? "Hide Solution" : "Show Solution"}
						</button>
					)}

					{currentStepIndex < totalSteps - 1 && (
						<button
							className="ffcom-playground-nav-button ffcom-playground-nav-primary"
							onClick={() => onNavigate(currentStepIndex + 1)}
						>
							Next
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
