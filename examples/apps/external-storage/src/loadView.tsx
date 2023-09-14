/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ISerializableDataObject, parseDataObject } from "@fluid-experimental/to-non-fluid";
import { IDetachedModel } from "@fluid-example/example-utils";
import { RootDataObject } from "./fluid-object";

interface LoadProps {
	detachedModel: IDetachedModel<RootDataObject>;
}

export const LoadView = (props: LoadProps) => {
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const [value, setValue] = React.useState("");

	const loadDataObject = async (text: string) => {
		const serializable = JSON.parse(text) as ISerializableDataObject;
		await props.detachedModel.model.fromLocalDataObject(parseDataObject(serializable));
		const id = await props.detachedModel.attach();
		location.hash = id;
		document.title = id;
		location.reload();
	};

	const deserialize = () => {
		const textarea = textareaRef.current;
		if (textarea === null) {
			throw new Error("unreferenced text area!");
		}
		loadDataObject(textarea.value).catch((error) => console.log(error));
	};
	const clear = () => {
		setValue("");
	};

	return (
		<div>
			<div>
				<textarea ref={textareaRef}></textarea>
			</div>
			<div>
				<button onClick={deserialize}>Deserialize</button>
				<button onClick={clear}>Clear</button>
				{value !== "" ? <pre>{value}</pre> : null}
			</div>
		</div>
	);
};
