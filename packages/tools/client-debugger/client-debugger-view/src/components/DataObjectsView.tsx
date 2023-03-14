/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import React from "react";

import { HasClientDebugger } from "../CommonProps";
import { initializeFluentUiIcons } from "../InitializeIcons";
import { SharedObjectRenderOptions } from "../RendererOptions";
import { SummaryTreeView } from "./data-object-views";

// Initialize icons if they have not yet been initialized.
initializeFluentUiIcons();

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
	const { clientDebugger } = props;
	const { container } = clientDebugger;

	const [summary, setSummary] = React.useState<ISummaryTree | undefined>(undefined);

	React.useEffect(() => {
		if (container._createSummary !== undefined) {
			const _summary = container._createSummary();
			setSummary(_summary);
		}
	}, [container]);

	const refreshButtonTooltipId = useId("refresh-button-tooltip");

	return (
		<div className="data-objects-view">
			{summary === undefined ? (
				<div>Couldn&apos;t generate summary</div>
			) : (
				<Stack>
					<Stack horizontal>
						<StackItem>
							<h3>Container Data</h3>
						</StackItem>
						<StackItem>
							<TooltipHost content="Refresh Data" id={refreshButtonTooltipId}>
								<IconButton
									onClick={(): void => setSummary(container._createSummary?.())}
								></IconButton>
							</TooltipHost>
						</StackItem>
					</Stack>
					<SummaryTreeView summary={summary} />
				</Stack>
			)}
		</div>
	);
}
