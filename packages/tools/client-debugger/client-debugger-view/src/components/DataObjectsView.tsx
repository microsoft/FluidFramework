/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { HasContainerId } from "@fluid-tools/client-debugger";
import React from "react";

import { SharedObjectRenderOptions } from "../RendererOptions";
import { DynamicDataView } from "./data-object-views";

/**
 * {@link DataObjectsView} input props.
 */
export interface DataObjectsViewProps extends HasContainerId {
	/**
	 * {@inheritDoc RendererOptions}
	 */
	renderOptions: SharedObjectRenderOptions;

	containerData: unknown;
}

/**
 * Displays the data inside a container.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link DataObjectsViewProps.renderOptions}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	const { containerData, renderOptions } = props;

	// TODO : use containerId to get its data

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
