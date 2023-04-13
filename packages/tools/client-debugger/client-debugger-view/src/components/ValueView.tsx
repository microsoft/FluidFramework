/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { ValueNodeBase } from "@fluid-tools/client-debugger";
import { Accordion } from "./utility-components";

/**
 * {@link ValueView} input props.
 */
export interface ValueViewProps {
	node: ValueNodeBase;
}

/**
 * Render data with type {@link VisualNodeKind.ValueNode}.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { node } = props;

	return (
		<Accordion
			header={
				<div>
					{`${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind}
						${String(node.value)}`}
				</div>
			}
		></Accordion>
	);
}
