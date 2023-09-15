/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITextField, IconButton, Stack, TextField } from "@fluentui/react";
import { assert } from "@fluidframework/core-utils";
import { SharedCounter } from "@fluidframework/counter";
import React from "react";
import { addIcon, stackTokens, standardLength, standardSidePadding } from "./constants";

export interface ICollaborativeCounterProps {
	data: SharedCounter;
}

export const CollaborativeCounter: React.FC<ICollaborativeCounterProps> = (
	props: ICollaborativeCounterProps,
) => {
	const [value, setValue] = React.useState(props.data.value);
	const incrementRef = React.useRef<ITextField>(null);

	React.useEffect(() => {
		const handleNumberChanged = () => {
			setValue(props.data.value);
		};

		props.data.on("incremented", handleNumberChanged);
		return () => {
			props.data.off("incremented", handleNumberChanged);
		};
	});

	const increment = () => {
		const incrementInput = incrementRef.current;
		assert(incrementInput !== null, "key ref not set!");
		if (incrementInput.value === undefined || incrementInput.value === "") return;
		const amount = Number.parseInt(incrementInput.value, 10);
		props.data.increment(amount);
	};

	return (
		<div style={standardSidePadding}>
			<Stack horizontal tokens={stackTokens}>
				<Stack.Item align="center" style={standardLength}>
					{value}
				</Stack.Item>
				<Stack.Item align="center">
					<TextField type="number" componentRef={incrementRef} />
				</Stack.Item>
				<Stack.Item align="center">
					<IconButton iconProps={addIcon} onClick={increment} />
				</Stack.Item>
			</Stack>
		</div>
	);
};
