/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { HasContainerId } from "@fluid-tools/client-debugger";
import React from "react";

/**
 * {@link DataObjectsView} input props.
 */
export type DataObjectsViewProps = HasContainerId;

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
