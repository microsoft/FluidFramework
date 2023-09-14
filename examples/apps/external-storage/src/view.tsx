/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	CollaborativeTextArea,
	CollaborativeMap,
	SharedStringHelper,
	CollaborativeDirectory,
} from "@fluid-experimental/react-inputs";
import { LocalDataObject, makeSerializableDataObject } from "@fluid-experimental/to-non-fluid";
import { ChildDataObject, RootDataObject } from "./fluid-object";

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
				setValue(JSON.stringify(serializableDataObject));
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
			{value !== "" ? <p>{value}</p> : null}
			<button onClick={serialize}>Serialize</button>
			<button onClick={clear}>Clear</button>
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
