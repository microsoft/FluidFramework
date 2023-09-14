/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
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
	const keyInputRef = React.useRef<HTMLInputElement>(null);
	const valueInputRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		const handleMapChanged = () => {
			console.log("event!");
			const array = [...props.data.entries()];
			setMap(array);
		};

		props.data.on("valueChanged", handleMapChanged);
		return () => {
			props.data.off("textChanged", handleMapChanged);
		};
	});

	const addEntry = () => {
		const keyInput = keyInputRef.current;
		const valueInput = valueInputRef.current;
		assert(keyInput !== null, "key ref not set!");
		assert(valueInput !== null, "value ref not set!");
		const key = keyInput.value;
		const value = valueInput.value;
		props.data.set(key, value);
	};

	const listStyle = {
		listStyleType: "none",
		margin: 0,
		padding: 0,
	};

	return (
		<div>
			<h3>Map</h3>
			<p>
				Key: <input type="text" ref={keyInputRef} /> Value:{" "}
				<input type="text" ref={valueInputRef} /> <button onClick={addEntry}>Set</button>
			</p>
			<ul style={listStyle}>
				{map.map(([key, value]) => (
					<li key={key}>
						{key}
						{":"}
						<input
							type="text"
							value={value}
							onInput={(ev: React.FormEvent<HTMLInputElement>) => {
								props.data.set(key, ev.currentTarget.value);
							}}
						/>
					</li>
				))}
			</ul>
		</div>
	);
};
