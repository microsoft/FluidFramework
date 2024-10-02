/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import "@site/src/css/fluidBundleLoader.css";

/**
 * {@link FluidBundleLoader} input props.
 */
export interface FluidBundleLoaderProps {
	idPrefix: string;
	bundleName: string;
}

/**
 * TODO
 */
export function FluidBundleLoader({
	idPrefix,
	bundleName,
}: FluidBundleLoaderProps): JSX.Element {
	React.useEffect(() => {
		const script = document.createElement("script");
		script.src = `https://storage.fluidframework.com/static/js/${bundleName}`;
		script.async = true;

		document.body.appendChild(script);

		return () => {
			document.body.removeChild(script);
		};
	}, [bundleName]);

	const leftPanelId = `${idPrefix}-left`;
	const rightPanelId = `${idPrefix}-right`;

	const containerId = Date.now().toString();

	return (
		<>
			<div id="content" style={{ minHeight: "200px" }}>
				<Panel containerId={containerId} elementId={leftPanelId} />
				<Panel containerId={containerId} elementId={rightPanelId} />
			</div>
		</>
	);
}

interface PanelProps {
	elementId: string;
	containerId: string;
}

function Panel({ containerId, elementId }: PanelProps): JSX.Element {
	return (
		<div className="browser-window-wrapper" id={elementId}>
			<div aria-hidden="true" className="browser-window">
				<div className="browser-window-nav">
					<div className="browser-window-nav-url">{`http://localhost:8080#${containerId}`}</div>
				</div>
				<div className="browser-window-icon-wrapper">
					<div className="browser-window-icon">−</div>
					<div className="browser-window-icon">□</div>
					<div className="browser-window-icon">x</div>
				</div>
			</div>
		</div>
	);
}
