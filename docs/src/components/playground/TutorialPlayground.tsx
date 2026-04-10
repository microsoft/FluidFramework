/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { PlaygroundWorkspace } from "./PlaygroundWorkspace";
import { StepGuide } from "./StepGuide";
import { modulesById } from "./data/modules";
import type { ValidationPattern } from "./data/types";

import "@site/src/css/playground.css";

/**
 * Runs validation patterns against user code to determine step completion.
 *
 * @remarks
 * Validation is regex-based: each {@link ValidationPattern} contains a regex
 * pattern string that is tested against the user's code. Comments are stripped
 * first so that TODO comments in the starter template don't accidentally match.
 * Sandpack handles compilation/runtime errors separately via its built-in
 * error overlay — this function only checks whether the user has written the
 * expected code constructs (e.g. imported the right symbol, called the right API).
 *
 * @returns An array of booleans, one per pattern, indicating whether each matched.
 * Returns false for any pattern that fails to compile as a regex.
 */
function runValidation(code: string, patterns: readonly ValidationPattern[]): boolean[] {
	const stripped = code
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
	return patterns.map((validationPattern) => {
		try {
			const regex = new RegExp(validationPattern.pattern, validationPattern.flags ?? "s");
			return regex.test(stripped);
		} catch {
			return false;
		}
	});
}

/**
 * {@link TutorialPlayground} component props.
 */
export interface TutorialPlaygroundProps {
	/**
	 * The module to render (e.g. "dice-roller" or "shared-tree-todo").
	 */
	readonly moduleId: string;

	/**
	 * URL for the "Back to Tutorials" link (e.g. "/docs/start/interactive-tutorial/").
	 */
	readonly moduleIndexUrl: string;
}

/**
 * Interactive tutorial playground for a single module.
 *
 * @remarks
 * Manages step navigation, code validation, and solution display for the
 * given module. Module selection is handled at the page level via Docusaurus
 * routing and the {@link ModuleSelector} component.
 */
export function TutorialPlayground({
	moduleId,
	moduleIndexUrl,
}: TutorialPlaygroundProps): React.ReactElement {
	/** Index of the currently active tutorial step. */
	const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
	/** Per-pattern pass/fail results for the current step's validation checks. */
	const [validationResults, setValidationResults] = React.useState<boolean[]>([]);
	/** Whether the solution code is currently displayed in the editor. */
	const [showSolution, setShowSolution] = React.useState(false);
	/** Bumped to force Sandpack to remount with the step's original template code. */
	const [resetCounter, setResetCounter] = React.useState(0);

	// Per-step saved code (user's own edits or last editor state)
	const codeSnapshotsRef = React.useRef<Map<number, string>>(new Map());

	// Saves user's code right before showing solution, for Hide Solution restore
	const preSolutionCodeRef = React.useRef<string | undefined>(undefined);

	// Track which steps have been completed (all validations passed)
	const completedStepsRef = React.useRef<Set<number>>(new Set());

	const selectedModule = modulesById[moduleId];
	const currentStep = selectedModule?.steps[currentStepIndex];

	// Always tracks the latest editor code so handleNavigate can snapshot it.
	const latestCodeRef = React.useRef("");

	const validateCode = React.useCallback(
		(code: string) => {
			if (currentStep === undefined) return;

			latestCodeRef.current = code;

			const results = runValidation(code, currentStep.validationPatterns);
			setValidationResults(results);

			if (results.length > 0 && results.every(Boolean)) {
				completedStepsRef.current.add(currentStepIndex);
			}
		},
		[currentStep, currentStepIndex],
	);

	const handleNavigate = (stepIndex: number): void => {
		// Save whatever is in the editor right now for this step.
		codeSnapshotsRef.current.set(currentStepIndex, latestCodeRef.current);
		// Clear pre-solution ref on navigation
		preSolutionCodeRef.current = undefined;

		// Pre-seed validation for the target step to avoid flash of unchecked items
		const targetStep = selectedModule?.steps[stepIndex];
		const targetSnapshot = codeSnapshotsRef.current.get(stepIndex);
		if (targetStep !== undefined && targetSnapshot !== undefined) {
			const preSeeded = runValidation(targetSnapshot, targetStep.validationPatterns);
			setValidationResults(preSeeded);
		} else {
			setValidationResults([]);
		}

		setCurrentStepIndex(stepIndex);
		setShowSolution(false);
	};

	const handleToggleSolution = (): void => {
		if (!showSolution) {
			// Showing solution: save current code for later restore
			preSolutionCodeRef.current = latestCodeRef.current;
			codeSnapshotsRef.current.set(currentStepIndex, latestCodeRef.current);
			setShowSolution(true);
		} else {
			// Hiding solution: restore user's pre-solution code
			if (preSolutionCodeRef.current !== undefined) {
				codeSnapshotsRef.current.set(currentStepIndex, preSolutionCodeRef.current);
			}
			preSolutionCodeRef.current = undefined;
			setShowSolution(false);
		}
	};

	const handleResetStep = (): void => {
		codeSnapshotsRef.current.delete(currentStepIndex);
		preSolutionCodeRef.current = undefined;
		completedStepsRef.current.delete(currentStepIndex);
		setShowSolution(false);
		setValidationResults([]);
		setResetCounter((c: number) => c + 1);
	};

	// Build the file map for the current step.
	// Priority: solution (if toggled) > saved snapshot > default template.
	//
	// IMPORTANT: The snapshot ref is intentionally read inside the memo function
	// but NOT listed in the deps array. This ensures the memo only recomputes
	// when the step or solution state changes (which are the only times we need
	// new files). During normal typing, setValidationResults triggers re-renders
	// but the memo returns its cached value, keeping the files reference stable
	// so Sandpack doesn't reset.
	const files = React.useMemo(
		() => {
			if (currentStep === undefined) {
				return {};
			}
			if (showSolution && currentStep.solution !== undefined) {
				return { ...currentStep.files, [currentStep.activeFile]: currentStep.solution };
			}
			const snapshot = codeSnapshotsRef.current.get(currentStepIndex);
			if (snapshot !== undefined) {
				return { ...currentStep.files, [currentStep.activeFile]: snapshot };
			}
			return currentStep.files;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- codeSnapshotsRef read intentionally excluded; see comment above
		[showSolution, currentStep, currentStepIndex, resetCounter],
	);

	if (selectedModule === undefined || currentStep === undefined) {
		return (
			<div className="ffcom-playground-container">
				<p>Unknown tutorial module: {moduleId}</p>
			</div>
		);
	}

	return (
		<div className="ffcom-playground-container">
			<PlaygroundWorkspace
				files={files}
				activeFile={currentStep.activeFile}
				dependencies={selectedModule.dependencies}
				onCodeChange={validateCode}
			/>
			<StepGuide
				step={currentStep}
				currentStepIndex={currentStepIndex}
				totalSteps={selectedModule.steps.length}
				validationResults={validationResults}
				showSolution={showSolution}
				completedSteps={completedStepsRef.current}
				moduleIndexUrl={moduleIndexUrl}
				onNavigate={handleNavigate}
				onToggleSolution={handleToggleSolution}
				onResetStep={handleResetStep}
			/>
		</div>
	);
}
