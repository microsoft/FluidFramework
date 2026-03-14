/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Link from "@docusaurus/Link";
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
	 * Set of step indices that have been completed.
	 */
	completedSteps: Set<number>;

	/**
	 * Callback when user navigates to a step.
	 */
	onNavigate: (stepIndex: number) => void;

	/**
	 * Callback to toggle showing the solution.
	 */
	onToggleSolution: () => void;

	/**
	 * Callback to reset the current step to boilerplate.
	 */
	onResetStep: () => void;
}

/**
 * Renders a string containing inline markdown (backtick code and **bold**)
 * as React elements.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
	// Split on `code` and **bold** tokens, preserving delimiters
	const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("`") && part.endsWith("`")) {
			return <code key={i}>{part.slice(1, -1)}</code>;
		}
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i}>{part.slice(2, -2)}</strong>;
		}
		return part;
	});
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
	completedSteps,
	onNavigate,
	onToggleSolution,
	onResetStep,
}: StepGuideProps): React.ReactElement {
	const [expandedHints, setExpandedHints] = React.useState<Set<number>>(new Set());

	const toggleHint = (index: number): void => {
		setExpandedHints((prev: Set<number>) => {
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

	const allPassed =
		step.validationPatterns.length === 0 ||
		(validationResults.length > 0 && validationResults.every(Boolean));

	return (
		<div className="ffcom-playground-guide">
			<StepIndicator
				currentStep={currentStepIndex}
				totalSteps={totalSteps}
				completedSteps={completedSteps}
			/>

			<h3 className="ffcom-playground-step-title">{step.title}</h3>
			<p className="ffcom-playground-step-description">{renderInlineMarkdown(step.description)}</p>

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
									{renderInlineMarkdown(hint)}
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
					className="ffcom-playground-nav-arrow"
					onClick={() => onNavigate(currentStepIndex - 1)}
					disabled={currentStepIndex === 0}
					aria-label="Previous step"
				>
					&#x2039;
				</button>

				<div className="ffcom-playground-nav-group">
					{step.solution !== undefined && (
						<button
							className={`ffcom-playground-nav-button ${showSolution ? "ffcom-playground-nav-active" : "ffcom-playground-nav-secondary"}`}
							onClick={onToggleSolution}
						>
							{showSolution ? "Hide Solution" : "Show Solution"}
						</button>
					)}

					<button
						className="ffcom-playground-nav-button ffcom-playground-nav-secondary"
						onClick={onResetStep}
					>
						Reset Step
					</button>

					{currentStepIndex === totalSteps - 1 && allPassed && (
						<Link
							className="ffcom-playground-nav-button ffcom-playground-nav-primary"
							to="/docs/start/interactive-tutorial/"
						>
							Back to Tutorials
						</Link>
					)}
				</div>

				{currentStepIndex < totalSteps - 1 ? (
					<button
						className={`ffcom-playground-nav-arrow ${allPassed ? "" : "ffcom-playground-nav-arrow--disabled"}`}
						onClick={() => onNavigate(currentStepIndex + 1)}
						disabled={!allPassed}
						aria-label="Next step"
						title={allPassed ? undefined : "Complete all checklist items to continue"}
					>
						&#x203A;
					</button>
				) : (
					<div className="ffcom-playground-nav-arrow ffcom-playground-nav-arrow--placeholder" />
				)}
			</div>
		</div>
	);
}
