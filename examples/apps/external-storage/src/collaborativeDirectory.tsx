/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { IDirectory } from "@fluidframework/map";
import React from "react";

export interface ICollaborativeDirectoryProps {
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
	const keyInputRef = React.useRef<HTMLInputElement>(null);
	const valueInputRef = React.useRef<HTMLInputElement>(null);
	const directoryInputRef = React.useRef<HTMLInputElement>(null);

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
		const key = keyInput.value;
		const value = valueInput.value;
		props.data.set(key, value);
	};

	const addSubDirectory = () => {
		const directoryInput = directoryInputRef.current;
		assert(directoryInput !== null, "key ref not set!");
		const directory = directoryInput.value;
		const subDirectory = props.data.createSubDirectory(directory);
		console.log(subDirectory);
		console.log(directories);
	};

	return (
		<div>
			<h3>Directory</h3>
			<p>
				Key: <input type="text" ref={keyInputRef} /> Value:{" "}
				<input type="text" ref={valueInputRef} /> <button onClick={addEntry}>Set</button>
			</p>
			<ul>
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
				<li>
					<input type="text" ref={directoryInputRef} />
					<button onClick={addSubDirectory}>Add SubDirectory</button>
				</li>
				{directories.length > 0 ? (
					<li>
						<ul>
							{directories.map(([key, value]) => (
								<li key={key}>
									<h2>{key}</h2>
									<CollaborativeDirectory data={value} />
								</li>
							))}
						</ul>
					</li>
				) : null}
			</ul>
		</div>
	);
};
