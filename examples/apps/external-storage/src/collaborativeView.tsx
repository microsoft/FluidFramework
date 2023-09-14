/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import { LocalDataObject, makeSerializableDataObject } from "@fluid-experimental/to-non-fluid";
import { ChildDataObject, RootDataObject } from "./fluid-object";
import { CollaborativeDirectory } from "./collaborativeDirectory";
import { CollaborativeMap } from "./collaborativeMap";

interface CollaborativeProps {
	model: RootDataObject;
}

interface ChildProps {
	model: ChildDataObject;
}

export const CollaborativeView = (props: CollaborativeProps) => {
	const [value, setValue] = React.useState("");
	const serialize = () => {
		props.model
			.toLocalDataObject()
			.then((localDataObject: LocalDataObject) => {
				console.log(localDataObject);
				const serializableDataObject = makeSerializableDataObject(localDataObject);
				console.log(serializableDataObject);
				console.log("abc");
				setValue(JSON.stringify(serializableDataObject, undefined, 2));
			})
			.catch((error) => console.log(error));
	};
	const clear = () => {
		setValue("");
	};

	return (
		<div>
			<CollaborativeDirectory data={props.model.directory} />
			<ChildView model={props.model.child} />
			<button onClick={serialize}>Serialize</button>
			<button onClick={clear}>Clear</button>
			{value !== "" ? <pre>{value}</pre> : null}
		</div>
	);
};

export const ChildView = (props: ChildProps) => {
	const sharedString = props.model.sharedString;
	return (
		<div>
			<CollaborativeMap data={props.model.map} />
			<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedString)} />
		</div>
	);
};
