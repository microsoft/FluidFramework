/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ModuleSelector } from "./ModuleSelector";
import { PlaygroundWorkspace } from "./PlaygroundWorkspace";
import { StepGuide } from "./StepGuide";
import { diceRollerTutorial } from "./data/diceRollerTutorial";
import { sharedTreeTutorial } from "./data/sharedTreeTutorial";
import type { TutorialModule } from "./data/types";

import "@site/src/css/playground.css";

const modules: TutorialModule[] = [diceRollerTutorial, sharedTreeTutorial];

/**
 * Top-level interactive tutorial playground component.
 *
 * @remarks
 * Manages module selection, step navigation, code validation, and solution display.
 */
export function TutorialPlayground(): React.ReactElement {
	const [selectedModuleId, setSelectedModuleId] = React.useState<string | undefined>(
		undefined,
	);
	const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
	const [validationResults, setValidationResults] = React.useState<boolean[]>([]);
	const [showSolution, setShowSolution] = React.useState(false);

	const selectedModule = modules.find((m) => m.id === selectedModuleId);
	const currentStep = selectedModule?.steps[currentStepIndex];

	const validateCode = React.useCallback(
		(code: string) => {
			if (currentStep === undefined) return;
			const results = currentStep.validationPatterns.map((vp) => {
				const regex = new RegExp(vp.pattern, vp.flags ?? "s");
				return regex.test(code);
			});
			setValidationResults(results);
		},
		[currentStep],
	);

	const handleModuleSelect = (moduleId: string): void => {
		setSelectedModuleId(moduleId);
		setCurrentStepIndex(0);
		setValidationResults([]);
		setShowSolution(false);
	};

	const handleNavigate = (stepIndex: number): void => {
		setCurrentStepIndex(stepIndex);
		setValidationResults([]);
		setShowSolution(false);
	};

	const handleToggleSolution = (): void => {
		setShowSolution((prev) => !prev);
	};

	const handleBackToModules = (): void => {
		setSelectedModuleId(undefined);
		setCurrentStepIndex(0);
		setValidationResults([]);
		setShowSolution(false);
	};

	if (selectedModule === undefined || currentStep === undefined) {
		return (
			<div className="ffcom-playground-container">
				<p className="ffcom-playground-intro">
					Choose a tutorial module to get started. Each module walks you through
					building a real Fluid application step by step, right in your browser.
				</p>
				<ModuleSelector modules={modules} onSelect={handleModuleSelect} />
			</div>
		);
	}

	// Build the file map, replacing the active file with the solution if shown
	const files = showSolution && currentStep.solution !== undefined
		? { ...currentStep.files, [currentStep.activeFile]: currentStep.solution }
		: currentStep.files;

	return (
		<div className="ffcom-playground-container">
			<PlaygroundWorkspace
				key={`${selectedModule.id}-${currentStepIndex}-${showSolution}`}
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
				onNavigate={handleNavigate}
				onToggleSolution={handleToggleSolution}
				onBackToModules={handleBackToModules}
			/>
		</div>
	);
}
