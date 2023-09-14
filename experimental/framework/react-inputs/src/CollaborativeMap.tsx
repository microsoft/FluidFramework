/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedMap } from "@fluidframework/map";
import React from "react";

export interface ICollaborativeMapProps {
	data: SharedMap;
}

/**
 * Given a SharedCell will produce a collaborative checkbox.
 */
export const CollaborativeMap: React.FC<ICollaborativeMapProps> = (
	props: ICollaborativeMapProps,
) => {
	const [map, setMap] = React.useState(Array.from(props.data.entries()));

	React.useEffect(() => {
		const handleMapChanged = () => {
			const array = [...props.data.entries()];
			setMap(array);
		};

		props.data.on("valueChanged", handleMapChanged);
		return () => {
			props.data.off("textChanged", handleMapChanged);
		};
	});

	const listStyle = {
		listStyleType: "none",
		margin: 0,
		padding: 0,
	};

	return (
		<div>
			<h3>Map</h3>
			<ul style={listStyle}>
				{map.map(([key, value]) => {
					<li>
						{key}
						{":"}
						<input
							type="text"
							value={value}
							onInput={(ev: React.FormEvent<HTMLInputElement>) => {
								props.data.set(key, ev.currentTarget.value);
							}}
						/>
					</li>;
				})}
			</ul>
		</div>
	);
};
