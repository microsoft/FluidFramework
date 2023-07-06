/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import { FocusTracker } from "./FocusTracker";
import { MouseTracker } from "./MouseTracker";
import { ITrackerAppModel, TrackerContainerRuntimeFactory } from "./containerCode";

function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "left";
	wrapperDiv.style.margin = "70px";
	div.appendChild(wrapperDiv);

	const focusDiv = document.createElement("div");
	focusDiv.style.fontSize = "14px";

	const onFocusChanged = () => {
		focusDiv.innerHTML = `
            Current user: ${focusTracker.audience.getMyself()?.userName}</br>
            ${getFocusPresencesString("</br>", focusTracker)}
        `;
	};

	onFocusChanged();
	focusTracker.on("focusChanged", onFocusChanged);

	wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(
	newLineSeparator: string = "\n",
	focusTracker: FocusTracker,
): string {
	const focusString: string[] = [];

	focusTracker.getFocusPresences().forEach((focus, userName) => {
		const prefix = `User ${userName}:`;
		if (focus === undefined) {
			focusString.push(`${prefix} unknown focus`);
		} else if (focus === true) {
			focusString.push(`${prefix} has focus`);
		} else {
			focusString.push(`${prefix} missing focus`);
		}
	});
	return focusString.join(newLineSeparator);
}

function renderMousePresence(
	mouseTracker: MouseTracker,
	focusTracker: FocusTracker,
	div: HTMLDivElement,
) {
	const onPositionChanged = () => {
		div.innerHTML = "";
		mouseTracker.getMousePresences().forEach((mousePosition, userName) => {
			const posDiv = document.createElement("div");
			posDiv.textContent = userName;
			posDiv.style.position = "absolute";
			posDiv.style.left = `${mousePosition.x}px`;
			posDiv.style.top = `${mousePosition.y}px`;
			if (focusTracker.getFocusPresences().get(userName) === true) {
				posDiv.style.fontWeight = "bold";
			}
			div.appendChild(posDiv);
		});
	};

	onPositionChanged();
	mouseTracker.on("mousePositionChanged", onPositionChanged);
}

/**
 * Start the app and render.
 *
 * @remarks We wrap this in an async function so we can await Fluid's async calls.
 */
async function start() {
	const tinyliciousModelLoader = new TinyliciousModelLoader<ITrackerAppModel>(
		new StaticCodeLoader(new TrackerContainerRuntimeFactory()),
	);

	let id: string;
	let model: ITrackerAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
	const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;

	renderFocusPresence(model.focusTracker, contentDiv);
	renderMousePresence(model.mouseTracker, model.focusTracker, mouseContentDiv);
}

start().catch((error) => console.error(error));

start().catch(console.error);
