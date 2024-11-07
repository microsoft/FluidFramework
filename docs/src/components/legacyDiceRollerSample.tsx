/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/legacyDiceRollerSample.css";

/**
 * Legacy dice roller sample component.
 *
 * @remarks
 * Leverages an old app bundle to render a Fluid-backed dice roller.
 * Used by the v1 docs, but should not be used by newer docs.
 *
 * Newer docs should use the {@link MockDiceRollerSample} component instead.
 */
export function LegacyDiceRollerSample(): JSX.Element {
	React.useEffect(() => {
		const script = document.createElement("script");
		script.src = `https://storage.fluidframework.com/static/js/dice-roller.2021-09-24.js`;
		script.async = true;

		document.body.append(script);

		return () => {
			script.remove();
		};
	}, []);

	const containerId = Date.now().toString();

	return (
		<div id="content" style={{ minHeight: "200px" }}>
			<Panel containerId={containerId} elementId={"dice-roller-left"} />
			<Panel containerId={containerId} elementId={"dice-roller-right"} />
		</div>
	);
}

interface PanelProps {
	elementId: string;
	containerId: string;
}

function Panel({ containerId, elementId }: PanelProps): JSX.Element {
	return (
		<div className="ffcom-legacy-dice-roller-window-wrapper" id={elementId}>
			<div aria-hidden="true" className="ffcom-legacy-dice-roller-window">
				<div className="ffcom-legacy-dice-roller-nav">
					<div className="ffcom-legacy-dice-roller-nav-url">{`http://localhost:8080#${containerId}`}</div>
				</div>
				<div className="ffcom-legacy-dice-roller-icon-wrapper">
					<div className="ffcom-legacy-dice-roller-icon">−</div>
					<div className="ffcom-legacy-dice-roller-icon">□</div>
					<div className="ffcom-legacy-dice-roller-icon">x</div>
				</div>
			</div>
		</div>
	);
}
