/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, ValueNodeBase } from "@fluid-tools/client-debugger";

/**
 * {@link ValueView} input props
 */
export interface ValueViewProps extends HasContainerId {
	node: ValueNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { containerId, node } = props;

	return <>{`containerId: ${containerId}, value: ${JSON.stringify(node.value)}`}</>;
}
