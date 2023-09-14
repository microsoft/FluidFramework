/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
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

	return (
		<div>
			<h3>Directory</h3>
			<ul>
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
				{directories.length > 0 ? (
					<li>
						<ul>
							{directories.map(([key, value]) => {
								<li>
									<div>{key}</div>
									<CollaborativeDirectory data={value} />
								</li>;
							})}
						</ul>
					</li>
				) : null}
			</ul>
		</div>
	);
};
