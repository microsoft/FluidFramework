/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
import { Accordion } from "./utility-components";

/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps {
	node: FluidObjectValueNode;
}

/**
 * Render data with type {@link VisualNodeKind.FluidValueNode}.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { node } = props;

	return (
		<Accordion
			header={
				<div>
					{`${node.fluidObjectId}
						${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind} : 
						${String(node.value)}`}
				</div>
			}
		>
			{String(node.value)}
		</Accordion>
	);
}
