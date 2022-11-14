/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { HasClientDebugger } from "../CommonProps";
import { SharedObjectRenderOptions } from "../RendererOptions";
import { FluidObjectView } from "./data-object-views";
import { Accordion } from "./utility-components";

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

	const objects = Object.entries(containerData).map(([key, value]) => ({
		name: key,
		loadableObject: value,
	}));

	const children = objects.map((object) => (
		<Accordion header={<b>{object.name}</b>}>
			<FluidObjectView
				fluidObjectHandle={object.loadableObject.handle}
				renderOptions={renderOptions}
			/>
		</Accordion>
	));

	return (
		<div className="data-objects-view">
			<h3>Container Data</h3>
			{children}
		</div>
	);
}
