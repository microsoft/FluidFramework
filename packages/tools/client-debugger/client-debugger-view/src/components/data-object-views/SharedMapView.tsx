/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactJson from "react-json-view";
import { SharedMap } from "@fluidframework/map";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
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
	const { sharedMap } = props;
	const [summary, setSummary] = React.useState<unknown>();

	React.useEffect(() => {
		const contentSummary = getTableSummary(sharedMap);

		contentSummary.then(result => {
			console.log("Result:", result);
			console.log("Result Type:", typeof result);

			setSummary(result);
		}).catch(error => {
			console.log('Error loading summarizer');
		});
	}, [sharedMap, setSummary]);

	return (
		<div>
			<ReactJson src={summary} />
		</div>
	);
}

async function getTableSummary(rootMap: SharedMap): Promise<ISummaryTreeWithStats> {
	const summary = await rootMap.summarize();

	const content = summary.summary.tree.header.content as string;

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const deserializedContent = JSON.parse(content);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
	return deserializedContent.content;
}