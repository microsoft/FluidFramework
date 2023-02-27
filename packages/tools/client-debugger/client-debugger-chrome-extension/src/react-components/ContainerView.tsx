/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { Stack, StackItem } from "@fluentui/react";

import { HasContainerId } from "@fluid-tools/client-debugger-view";

import { ContainerSummaryView } from "./ContainerSummaryView";

// TODO: View tabs
// enum PanelOptions {
// 	ContainerSummary = "Container Summary",
// 	ContainerData = "Container Data",
// 	Audience = "Audience",
// }

/**
 * {@link ContainerView} input props.
 */
export type ContainerViewProps = HasContainerId;

/**
 * Root debug view for an individual Container.
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	// TODO: tab selection management

	return (
		<Stack>
			<StackItem>
				<TabMenu />
			</StackItem>
			<StackItem>
				<ContainerSummaryView containerId={containerId} />
			</StackItem>
		</Stack>
	);
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface TabMenuProps {}

function TabMenu(props: TabMenuProps): React.ReactElement {
	return <div>TODO: View selection menu</div>;
}
