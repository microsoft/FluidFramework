/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { SharedMap } from "@fluidframework/map";
import { IconButton } from "@fluentui/react";

import { RenderChild } from "../../RendererOptions";
import { MapEntryView } from "./MapEntryView";

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
	const [collapsed, setCollapsed] = React.useState<{[key: string]: boolean}>(() => {
		const collapsedState: {[key: string]: boolean} = {};
		// eslint-disable-next-line unicorn/no-array-for-each
		entries.forEach(([key]) => {
			collapsedState[key] = true;
		});
		return collapsedState;
	});

	React.useEffect(() => {
		function updateEntries(): void {
		  const newEntries = [...sharedMap.entries()];
		  setEntries(newEntries);
	  
		  const newCollapsed = { ...collapsed };
	  
		  for (const [key] of newEntries) {
			if (collapsed[key] === undefined) {
			  newCollapsed[key] = true;
			}
		  }
	  
		  for (const key of Object.keys(collapsed)) {
			if (!newEntries.some(([k]) => k === key)) {
			  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			  delete newCollapsed[key];
			}
		  }
	  
		  setCollapsed(newCollapsed);
		}
	  
		setEntries([...sharedMap.entries()]);
		sharedMap.on("valueChanged", updateEntries);
	  
		return (): void => {
		  sharedMap.off("valueChanged", updateEntries);
		};
	  }, [sharedMap, setEntries, collapsed]);
	  

	const toggleCollapse = (key: string): void => {
		setCollapsed({
			...collapsed,
			[key]: !collapsed[key],
		});
	};


	const iconStyle = {
		display: "flex",
		alignItems: "center",
		backgroundColor: "rgb(237, 235, 233)",
	}

	const mapEntryViewStyle = {
		marginLeft: "50px" 
	}

	return (
		<div>
			{entries.map(([key, value]) => (
				<div key={key}>
					<div style={iconStyle}>
						<IconButton
							iconProps={{
								iconName: collapsed[key] ? "ChevronRight" : "ChevronDown",
							}}
							onClick={(): void => toggleCollapse(key)}
						/>
						<span> {key} </span>
					</div>
					{!collapsed[key] && (
						<div style={mapEntryViewStyle}>
							<MapEntryView data={value} renderChild={renderChild}/>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
