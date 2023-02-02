/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import React from "react";

const FauxComponentView: React.FC = () => (
	<div style={{ padding: "2pt 10pt", background: "lightyellow", margin: "2pt" }}>
		<h1>✨ Hello, host! ✨</h1>
	</div>
);

/** A placeholder data object used to render an HTML element when it is mounted by the host. */
class FauxComponent extends DataObject {
	public static readonly Factory = new DataObjectFactory(
		"FauxComponent",
		FauxComponent,
		[],
		{},
		[],
	);
}

const fauxComponentViewCallback = (model: FauxComponent) => <FauxComponentView />;

export const fluidExport = new ContainerViewRuntimeFactory(
	FauxComponent.Factory,
	fauxComponentViewCallback,
);
