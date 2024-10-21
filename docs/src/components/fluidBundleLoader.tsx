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
	className?: string;
}

/**
 * TODO
 */
export function FluidBundleLoader({
	idPrefix,
	bundleName,
	className,
}: FluidBundleLoaderProps): JSX.Element {
	useFluidBundle(bundleName);

	const leftPanelId = `${idPrefix}-left`;
	const rightPanelId = `${idPrefix}-right`;

	const containerId = Date.now().toString();

	return (
		<>
			<div id="content" className={className}>
				<FluidAppPanel containerId={containerId} elementId={leftPanelId} />
				<FluidAppPanel containerId={containerId} elementId={rightPanelId} />
			</div>
		</>
	);
}

export interface FluidAppPanelProps {
	elementId: string;
	containerId: string;
}

export function FluidAppPanel({ containerId, elementId }: FluidAppPanelProps): JSX.Element {
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



/**
 * React effect that loads the specified Fluid app bundle and injects it into the document.
 */
export function useFluidBundle(bundleName: string): void {
	React.useEffect(() => {
		const script = document.createElement("script");
		script.src = `https://storage.fluidframework.com/static/js/${bundleName}`;
		script.async = true;

		document.body.appendChild(script);

		return () => {
			document.body.removeChild(script);
		};
	}, [bundleName]);
}
