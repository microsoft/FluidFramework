/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Link from "@docusaurus/Link";
import React from "react";

import { moduleList } from "./data/modules";

import "@site/src/css/playground.css";

/**
 * Renders a card grid for selecting a tutorial module.
 * Each card links to the module's dedicated sub-page.
 */
export function ModuleSelector(): React.ReactElement {
	return (
		<div className="ffcom-playground-module-selector">
			{moduleList.map((mod) => (
				<Link
					key={mod.id}
					className="ffcom-playground-module-card"
					to={`./${mod.id}`}
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
				</Link>
			))}
		</div>
	);
}
