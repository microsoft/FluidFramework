/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { SharedMap } from "@fluidframework/map";
import { IconButton } from "@fluentui/react";
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
	const [collapsedEntries, setCollapsedEntries] = React.useState<{ [key: string]: boolean }>(
		// eslint-disable-next-line unicorn/prefer-object-from-entries, unicorn/no-array-reduce
		entries.reduce((obj, [key]) => ({ ...obj, [key]: true }), {}),
	);

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

	const toggleCollapse = (key: string): void => {
		setCollapsedEntries({
			...collapsedEntries,
			[key]: !collapsedEntries[key],
		});
	};

	return (
		<div>
			{entries.map(([key, value]) => (
				<div key={key}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							backgroundColor: "rgb(237, 235, 233)",
						}}
					>
						<IconButton
							iconProps={{
								iconName: collapsedEntries[key] ? "ChevronRight" : "ChevronDown",
							}}
							onClick={(): void => toggleCollapse(key)}
						/>
						<span> {key} </span>
					</div>
					{!collapsedEntries[key] && (
						<div>
							<h4 style={{ marginLeft: "50px" }}>
								{" "}
								{getTableValue(value, renderChild)}{" "}
							</h4>
						</div>
					)}
				</div>
			))}
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
		return (
			<>
				<span
					style={{
						color: "blue",
						opacity: 0.6,
						fontWeight: "lighter",
						fontSize: "small",
					}}
				>
					{" "}
					{typeof data}{" "}
				</span>
				{data}
			</>
		);
	}

	return <>{_renderChild(data)}</>;
}
