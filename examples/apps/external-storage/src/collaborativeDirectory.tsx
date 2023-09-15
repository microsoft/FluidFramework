/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, TextField, PrimaryButton, ITextField } from "@fluentui/react";
import { assert } from "@fluidframework/core-utils";
import { IDirectory } from "@fluidframework/map";
import React from "react";
import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
} from "@fluentui/react-components";
import {
	standardPaddingStyle,
	stackTokens,
	sendIcon,
	standardLength,
	addIcon,
	marginTop10,
} from "./constants";

export interface ICollaborativeDirectoryProps {
	subDirectoryName?: string;
	data: IDirectory;
}

/**
 * Given a SharedCell will produce a collaborative checkbox.
 */
export const CollaborativeDirectory: React.FC<ICollaborativeDirectoryProps> = (
	props: ICollaborativeDirectoryProps,
) => {
	const [map, setMap] = React.useState(Array.from(props.data.entries()));
	const [directories, setDirectories] = React.useState(Array.from(props.data.subdirectories()));
	const keyInputRef = React.useRef<ITextField>(null);
	const valueInputRef = React.useRef<ITextField>(null);
	const directoryInputRef = React.useRef<ITextField>(null);

	React.useEffect(() => {
		const handleDirectoryChanged = () => {
			setMap([...props.data.entries()]);
		};
		const handleSubDirectoryChanged = () => {
			setDirectories([...props.data.subdirectories()]);
		};

		props.data.on("containedValueChanged", handleDirectoryChanged);
		props.data.on("subDirectoryCreated", handleSubDirectoryChanged);
		return () => {
			props.data.off("containedValueChanged", handleDirectoryChanged);
			props.data.off("subDirectoryCreated", handleSubDirectoryChanged);
		};
	});

	const addEntry = () => {
		const keyInput = keyInputRef.current;
		const valueInput = valueInputRef.current;
		assert(keyInput !== null, "key ref not set!");
		assert(valueInput !== null, "value ref not set!");
		const key = keyInput.value ?? "";
		const value = valueInput.value;
		props.data.set(key, value);
	};

	const addSubDirectory = () => {
		const directoryInput = directoryInputRef.current;
		assert(directoryInput !== null, "key ref not set!");
		const directory = directoryInput.value ?? "";
		if (directory === "") return;
		const subDirectory = props.data.createSubDirectory(directory);
		console.log(subDirectory);
		console.log(directories);
	};

	return (
		<div style={standardPaddingStyle}>
			<Stack horizontal tokens={stackTokens}>
				<Stack.Item align="center">
					<TextField placeholder="Key" type="text" componentRef={keyInputRef} />
				</Stack.Item>
				<Stack.Item align="center">
					<TextField placeholder="Value" type="text" componentRef={valueInputRef} />
				</Stack.Item>
				<Stack.Item align="center">
					<PrimaryButton text="Set" iconProps={sendIcon} onClick={addEntry} />
				</Stack.Item>
			</Stack>
			{map.map(([key, value]) => (
				<Stack key={key} horizontal tokens={stackTokens} style={marginTop10}>
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
			<div style={marginTop10}>
				<TextField label="Subdirectories" type="text" componentRef={directoryInputRef} />
				<div style={marginTop10}>
					<PrimaryButton
						text="Add Subdirectory"
						iconProps={addIcon}
						onClick={addSubDirectory}
					/>
				</div>
			</div>

			<Accordion multiple collapsible>
				{directories.map(([key, value], index) => (
					<AccordionItem key={key} value={index}>
						<AccordionHeader>{key}</AccordionHeader>
						<AccordionPanel>
							<CollaborativeDirectory subDirectoryName={key} data={value} />
						</AccordionPanel>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
};
