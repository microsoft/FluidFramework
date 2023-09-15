/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	ISerializableDataObject,
	LoadableDataObject,
	parseDataObject,
} from "@fluid-experimental/to-non-fluid";
import { IDetachedModel, TinyliciousModelLoader } from "@fluid-example/example-utils";
import { ITextField, PrimaryButton, TextField, ThemeProvider } from "@fluentui/react";
import { RootDataObject } from "./fluid-object";
import { DownloadableViewContainerRuntimeFactory } from "./container";
import { addIcon, darkTheme, rootStyle } from "./constants";

interface LoadProps {
	rootLoader: TinyliciousModelLoader<RootDataObject>;
	loadableLoader: TinyliciousModelLoader<LoadableDataObject>;
	runtimeFactory: DownloadableViewContainerRuntimeFactory;
}

export const LoadView = (props: LoadProps) => {
	const textareaRef = React.useRef<ITextField>(null);

	const loadDataObject = async (text: string) => {
		let detached: IDetachedModel<RootDataObject | LoadableDataObject>;
		if (text.length > 0) {
			const serializable = JSON.parse(text) as ISerializableDataObject;
			props.runtimeFactory.setDefaultType(serializable.type);
			detached = await props.loadableLoader.createDetached("1.0");
			await detached.model.fromLocalDataObject(parseDataObject(serializable));
		} else {
			detached = await props.rootLoader.createDetached("1.0");
		}

		const id = await detached.attach();
		location.hash = id;
		document.title = id;
		location.reload();
	};

	const deserialize = () => {
		const textarea = textareaRef.current;
		if (textarea === null || textarea.value === undefined) {
			throw new Error("unreferenced text area!");
		}
		loadDataObject(textarea.value).catch((error) => console.log(error));
	};

	const textareaStyle: React.CSSProperties = {
		width: "100%",
	};

	return (
		<ThemeProvider applyTo="body" theme={darkTheme}>
			<div style={rootStyle}>
				<div style={{ marginBottom: 10 }}>
					<PrimaryButton text="Create" iconProps={addIcon} onClick={deserialize} />
				</div>
				<div style={textareaStyle}>
					<TextField
						style={{ fontFamily: "monospace" }}
						multiline
						autoAdjustHeight
						rows={30}
						componentRef={textareaRef}
					/>
				</div>
			</div>
		</ThemeProvider>
	);
};
