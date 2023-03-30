/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { HasContainerId } from "@fluid-tools/client-debugger";
import React from "react";

import { SharedObjectRenderOptions } from "../RendererOptions";

/**
 * {@link DataObjectsView} input props.
 */
export interface DataObjectsViewProps extends HasContainerId {
	/**
	 * {@inheritDoc RendererOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * Displays the data inside a container.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link DataObjectsViewProps.renderOptions}.
 */
export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
	return (
		<div className="data-objects-view">
			<h3>Container Data</h3>
			<div>TODO: data visualization is not yet supported.</div>
		</div>
	);
}
