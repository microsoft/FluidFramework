/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { Stack, StackItem } from "@fluentui/react";

import {
	HasContainerId,
	PanelView,
	PanelViewSelectionMenu,
} from "@fluid-tools/client-debugger-view";

import { ContainerSummaryView } from "./ContainerSummaryView";
import { ContainerDataView } from "./ContainerDataView";
import { AudienceView } from "./AudienceView";

/**
 * {@link ContainerView} input props.
 */
export type ContainerViewProps = HasContainerId;

/**
 * Root debug view for an individual Container.
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	// TODO: Listen for Container close / dispose notifications and replace inner views with notice
	// when received.
	const [isContainerClosed /* , setIsContainerClosed */] = React.useState<boolean>(false);

	// Inner view selection
	const [viewSelection, setViewSelection] = React.useState<PanelView>(PanelView.ContainerData);

	let view: React.ReactElement;
	if (isContainerClosed) {
		view = <div>The Container has been closed.</div>;
	} else {
		let innerView: React.ReactElement;
		switch (viewSelection) {
			case PanelView.ContainerData:
				innerView = <ContainerDataView containerId={containerId} />;
				break;
			case PanelView.Audience:
				innerView = <AudienceView containerId={containerId} />;
				break;
			default:
				throw new Error(`Unrecognized RootView selection value: "${viewSelection}".`);
		}

		view = (
			<Stack tokens={{ childrenGap: 10 }}>
				<PanelViewSelectionMenu
					currentSelection={viewSelection}
					updateSelection={setViewSelection}
				/>
				{innerView}
			</Stack>
		);
	}

	return (
		<Stack>
			<StackItem>
				<ContainerSummaryView containerId={containerId} />
			</StackItem>
			<StackItem>{view}</StackItem>
		</Stack>
	);
}
