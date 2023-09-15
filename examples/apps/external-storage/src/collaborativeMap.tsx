/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITextField, PrimaryButton, Stack, TextField } from "@fluentui/react";
import { assert } from "@fluidframework/core-utils";
import { SharedMap } from "@fluidframework/map";
import React from "react";
import { sendIcon, stackTokens, standardLength, standardPaddingStyle } from "./constants";

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
	const keyInputRef = React.useRef<ITextField>(null);
	const valueInputRef = React.useRef<ITextField>(null);

	React.useEffect(() => {
		const handleMapChanged = () => {
			console.log("event!");
			const array = [...props.data.entries()];
			setMap(array);
		};

		props.data.on("valueChanged", handleMapChanged);
		return () => {
			props.data.off("valueChanged", handleMapChanged);
		};
	});

	const addEntry = () => {
		const keyInput = keyInputRef.current;
		const valueInput = valueInputRef.current;
		assert(keyInput !== null, "key ref not set!");
		assert(valueInput !== null, "value ref not set!");
		const key = keyInput.value ?? "";
		const value = valueInput.value ?? "";
		props.data.set(key, value);
	};

	return (
		<div style={standardPaddingStyle}>
			<Stack horizontal tokens={stackTokens}>
				<Stack.Item align="center">
					<TextField label="Key" underlined type="text" componentRef={keyInputRef} />
				</Stack.Item>
				<Stack.Item align="center">
					<TextField label="Value" underlined type="text" componentRef={valueInputRef} />
				</Stack.Item>
				<Stack.Item align="center">
					<PrimaryButton text="Set" iconProps={sendIcon} onClick={addEntry} />
				</Stack.Item>
			</Stack>

			{map.map(([key, value]) => (
				<Stack key={key} horizontal tokens={stackTokens} style={{ marginTop: 10 }}>
					<Stack.Item align="center" style={standardLength}>
						{key}
					</Stack.Item>
					<Stack.Item align="center">
						<TextField
							type="text"
							value={value}
							onChange={(ev) => {
								props.data.set(key, ev.currentTarget.value);
							}}
						/>
					</Stack.Item>
				</Stack>
			))}
		</div>
	);
};
