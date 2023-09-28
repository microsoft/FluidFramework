/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { performance } from "@fluid-internal/client-utils";

import React, { useEffect, useRef } from "react";

import { controls, ui } from "./client-ui-lib";
import { SharedTextDataObject } from "./dataObject";

/* eslint-disable import/no-internal-modules, import/no-unassigned-import */
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/css/bootstrap-theme.min.css";
import "../stylesheets/map.css";
import "../stylesheets/style.css";
/* eslint-enable import/no-internal-modules, import/no-unassigned-import */

const debug = registerDebug("fluid:shared-text");

class SharedTextView {
	private uiInitialized = false;

	public constructor(private readonly sharedTextDataObject: SharedTextDataObject) {}

	public render(element: HTMLElement) {
		if (this.uiInitialized) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.initializeUI(element).catch(debug);
		this.uiInitialized = true;
	}

	private async initializeUI(div): Promise<void> {
		const browserContainerHost = new ui.BrowserContainerHost();

		const containerDiv = document.createElement("div");
		containerDiv.classList.add("flow-container");
		const container = new controls.FlowContainer(
			containerDiv,
			"Shared Text",
			this.sharedTextDataObject.exposedRuntime,
			this.sharedTextDataObject.sharedString,
		);
		const theFlow = container.flowView;
		browserContainerHost.attach(container, div);

		theFlow.render(0, true);
		theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

		theFlow.setEdit();

		this.sharedTextDataObject.sharedString.loaded
			.then(() => {
				theFlow.loadFinished(performance.now());
				debug(
					`${
						this.sharedTextDataObject.exposedRuntime.id
					} fully loaded: ${performance.now()} `,
				);
			})
			.catch((e) => {
				console.error(e);
			});
	}
}

export interface ISharedTextReactViewProps {
	readonly sharedTextDataObject: SharedTextDataObject;
}

export const SharedTextReactView: React.FC<ISharedTextReactViewProps> = (
	props: ISharedTextReactViewProps,
) => {
	const { sharedTextDataObject } = props;
	const htmlView = useRef<SharedTextView>(new SharedTextView(sharedTextDataObject));
	const divRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (divRef.current !== null) {
			htmlView.current.render(divRef.current);
		}
	}, [divRef.current]);
	// FlowContainer does its own layout that doesn't play nice with normal CSS layout.  Stretch the wrapping div
	// so it can successfully take the full page height.
	return <div style={{ height: "100vh" }} ref={divRef}></div>;
};
