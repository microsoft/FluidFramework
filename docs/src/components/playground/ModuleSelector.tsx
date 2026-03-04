/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { TutorialModule } from "./data/types";

/**
 * {@link ModuleSelector} component props.
 */
export interface ModuleSelectorProps {
	/**
	 * Available tutorial modules.
	 */
	modules: TutorialModule[];

	/**
	 * Callback when a module is selected.
	 */
	onSelect: (moduleId: string) => void;
}

/**
 * Renders a card grid for selecting a tutorial module.
 */
export function ModuleSelector({
	modules,
	onSelect,
}: ModuleSelectorProps): React.ReactElement {
	return (
		<div className="ffcom-playground-module-selector">
			{modules.map((mod) => (
				<button
					key={mod.id}
					className="ffcom-playground-module-card"
					onClick={() => onSelect(mod.id)}
				>
					<div className="ffcom-playground-module-card-header">
						<h3 className="ffcom-playground-module-title">{mod.title}</h3>
						<span
							className={`ffcom-playground-difficulty-badge ffcom-playground-difficulty-${mod.difficulty.toLowerCase()}`}
						>
							{mod.difficulty}
						</span>
					</div>
					<p className="ffcom-playground-module-description">{mod.description}</p>
					<div className="ffcom-playground-module-meta">
						{mod.steps.length} steps
					</div>
				</button>
			))}
		</div>
	);
}
