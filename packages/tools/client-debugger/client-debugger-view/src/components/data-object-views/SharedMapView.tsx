/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { SharedMap } from "@fluidframework/map";

import { RenderChild } from "../../RendererOptions";
import { Accordion } from "../utility-components";

/**
 * {@link SharedMapView} input props.
 */
export interface SharedMapViewProps {
	/**
	 * {@link @fluidframework/map#SharedMap} whose data will be displayed.
	 */
	sharedMap: SharedMap;

	/**
	 * Callback to render child values in {@link SharedMapViewProps.sharedMap}.
	 */
	renderChild: RenderChild;
}

/**
 * Default {@link @fluidframework/map#SharedMap} viewer.
 */
export function SharedMapView(props: SharedMapViewProps): React.ReactElement {
	const { sharedMap, renderChild } = props;

	const [entries, setEntries] = React.useState<[string, unknown][]>([...sharedMap.entries()]);

	React.useEffect(() => {
		function updateEntries(): void {
			setEntries([...sharedMap.entries()]);
		}

		sharedMap.on("valueChanged", updateEntries);

		return (): void => {
			sharedMap.off("valueChanged", updateEntries);
		};
	}, []);

	return (
		<Stack>
			<StackItem>
				<b>SharedMap</b>
			</StackItem>
			<StackItem>Entry count: {entries.length}</StackItem>
			{entries.map(([key, value]) => (
				<StackItem key={`map-entry-${key}`}>
					<Accordion
						header={
							<div>
								<b>"{key}"</b>
							</div>
						}
					>
						{renderChild(value)}
					</Accordion>
				</StackItem>
			))}
		</Stack>
	);
}
