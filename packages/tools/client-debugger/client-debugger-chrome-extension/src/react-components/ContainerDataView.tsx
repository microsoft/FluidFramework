/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import { HasContainerId } from "@fluid-tools/client-debugger";
import React from "react";

/**
 * {@link ContainerDataView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContainerDataViewProps extends HasContainerId {
	// TODO
}

/**
 * View containing a drop-down style view of {@link ContainerDataViewProps.initialObjects}.
 *
 * @remarks
 *
 * Dispatches data object rendering based on those provided view {@link ContainerDataViewProps.renderOptions}.
 */
export function ContainerDataView(props: ContainerDataViewProps): React.ReactElement {
	const { containerId } = props;

	// TODO: Post message requesting Container data
	// TODO: Listen for Container data updates

	React.useEffect(() => {
		// TODO
	}, [containerId]);

	return (
		<Stack>
			<StackItem>
				<h3>Container Data</h3>
			</StackItem>
			<StackItem>
				<div>TODO</div>
			</StackItem>
		</Stack>
	);
}
