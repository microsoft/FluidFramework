/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { RenderChild } from "../../RendererOptions";

/**
 * {@link MapEntryView} input props.
 */
export interface MapEntryViewProps {
	/**
	 * {@link MapEntryViewProps.value}.
	 */
	data: unknown;

	/**
	 * Callback to render child values in {@link SharedMapViewProps.sharedMap}.
	 */
	renderChild: RenderChild;
}

/**
 * {@link MapEntryView} input props.
 */
export function MapEntryView(props: MapEntryViewProps): React.ReactElement {
	const { data, renderChild } = props;

	return (
		<div>
			<h1> {getTableValue(data, renderChild)} </h1>
		</div>
	);
}

function getTableValue(data: unknown, _renderChild: RenderChild): React.ReactNode {
	if (data === undefined) {
		return "undefined";
	}

	if (data === null) {
		return "null";
	}

	if (typeof data === "string" || typeof data === "number") {
		const dataTypeStyle = {
			color: "blue",
			opacity: 0.6,
			fontWeight: "lighter",
			fontSize: "small",
		};

		const dataStyle = {
			fontWeight: "lighter",
			fontSize: "medium",
		};

		return (
			<>
				<span style={dataTypeStyle}>{typeof data}</span>
				<span style={dataStyle}> {data} </span>
			</>
		);
	}

	return <>{_renderChild(data)}</>;
}
