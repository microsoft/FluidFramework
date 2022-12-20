/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { HasClientDebugger } from "../CommonProps";
import { SharedObjectRenderOptions } from "../RendererOptions";
import { DynamicDataView } from "./data-object-views";

/**
 * {@link DataObjectsView} input props.
 */
export interface DataObjectsViewProps extends HasClientDebugger {
	/**
	 * {@inheritDoc RendererOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * View containing a drop-down style view of {@link DataObjectsViewProps.initialObjects}.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link DataObjectsViewProps.renderOptions}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	const { clientDebugger, renderOptions } = props;

	const { containerData } = clientDebugger;

	return (
		<div className="data-objects-view">
			<h3>Container Data</h3>
			{containerData === undefined ? (
				<div>No Container data provided at debugger initialization.</div>
			) : (
				<DynamicDataView data={containerData} renderOptions={renderOptions} />
			)}
		</div>
	);
}
