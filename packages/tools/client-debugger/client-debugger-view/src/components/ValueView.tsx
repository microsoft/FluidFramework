/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, ValueNodeBase } from "@fluid-tools/client-debugger";
import { Accordion } from "./utility-components";

/**
 * {@link ValueView} input props.
 */
export interface ValueViewProps extends HasContainerId {
	node: ValueNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { containerId, node } = props;
	// <div>{`containerId: ${containerId}, value: ${String(node.value)}`}</div>;

	return (
		<Accordion key={ containerId } header={<div>{`${String(node.value)}, ${node.metadata}`}</div>} className="ValueView">
			String(node.value)
		</Accordion>
	)
}
