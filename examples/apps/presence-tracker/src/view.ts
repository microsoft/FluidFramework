/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FocusTracker } from "./FocusTracker";
import { MouseTracker } from "./MouseTracker";

export function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
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

export function renderMousePresence(
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
