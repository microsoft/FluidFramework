/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { SharedMap } from "@fluidframework/map";

import { RenderChild } from "../../RendererOptions";

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

		setEntries([...sharedMap.entries()]);
		sharedMap.on("valueChanged", updateEntries);

		return (): void => {
			sharedMap.off("valueChanged", updateEntries);
		};
	}, [sharedMap, setEntries]);

	return (
<<<<<<< HEAD
		<table style={{borderCollapse: "collapse"}}>
			<thead>
				<tr>
					<th>Key</th>
					<th>Value</th>
				</tr>
			</thead>
			<tbody style={{borderCollapse: "collapse"}}>
				{entries.map(([key, value]) => (
					<tr style={{borderCollapse: "collapse", border: "thin solid" }}>
						<td data-label="Key" style={{borderCollapse: "collapse", border: "thin solid" }}>{key}</td>
						<td data-label="Value">{getTableValue(value, renderChild)}</td>
					</tr>
				))}
			</tbody>
		</table>
=======
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
								<b>&quot;{key}&quot;</b>
							</div>
						}
					>
						{renderChild(value)}
					</Accordion>
				</StackItem>
			))}
		</Stack>
>>>>>>> b4335b85f33970d3802b501abfba0a01d2c4645b
	);
}

function getTableValue(data: unknown, _renderChild: RenderChild): React.ReactNode {
	if (data === undefined) {
		return "undefined";
	}

	if (data === null) {
		return "null";
	}

	if (typeof data === ("string" || "number")) {
		return <>{data}</>;
	}

	return <>{_renderChild(data)}</>;
}
