/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FocusTracker } from "./FocusTracker.js";
import type { MouseTracker } from "./MouseTracker.js";
import type { PointerTracker } from "./PointerTracker.js";

export function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
	const wrapperDiv = document.createElement("div");
	wrapperDiv.style.textAlign = "left";
	wrapperDiv.style.margin = "70px";
	div.appendChild(wrapperDiv);

	const focusDiv = document.createElement("div");
	focusDiv.id = "focus-div";
	focusDiv.style.fontSize = "14px";

	const focusMessageDiv = document.createElement("div");
	focusMessageDiv.id = "message-div";
	focusMessageDiv.textContent = "Click to focus";
	focusMessageDiv.style.position = "absolute";
	focusMessageDiv.style.top = "10px";
	focusMessageDiv.style.right = "10px";
	focusMessageDiv.style.color = "red";
	focusMessageDiv.style.fontWeight = "bold";
	focusMessageDiv.style.fontSize = "18px";
	focusMessageDiv.style.border = "2px solid red";
	focusMessageDiv.style.padding = "10px";
	focusMessageDiv.style.display = "none";
	wrapperDiv.appendChild(focusMessageDiv);

	const onFocusChanged = () => {
		const currentUser = focusTracker.audience.getMyself()?.name;
		const focusPresences = focusTracker.getFocusPresences();

		focusDiv.innerHTML = `
            Current user: ${currentUser}</br>
            ${getFocusPresencesString("</br>", focusTracker)}
        `;

		focusMessageDiv.style.display =
			currentUser !== undefined && focusPresences.get(currentUser) === false ? "" : "none";
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
			if (focusTracker.getFocusPresences().get(userName) === true) {
				const posDiv = document.createElement("div");
				posDiv.textContent = `/${userName}`;
				posDiv.style.position = "absolute";
				posDiv.style.left = `${mousePosition.x}px`;
				posDiv.style.top = `${mousePosition.y - 6}px`;
				posDiv.style.fontWeight = "bold";
				div.appendChild(posDiv);
			}
		});
	};

	onPositionChanged();
	mouseTracker.on("mousePositionChanged", onPositionChanged);
}

export function renderPointerPresence(pointerTracker: PointerTracker, div: HTMLDivElement) {
	function onPositionChanged() {
		div.innerHTML = "";
		pointerTracker.getPointerPresences().forEach((pointerPosition, pointerId) => {
			const posDiv = document.createElement("div");
			posDiv.textContent = `\\${pointerId}`;
			posDiv.style.position = "absolute";
			posDiv.style.left = `${pointerPosition.x}px`;
			posDiv.style.top = `${pointerPosition.y + 6}px`;
			posDiv.style.fontWeight = "lighter";
			div.appendChild(posDiv);
		});
	}

	onPositionChanged();
	pointerTracker.on("pointerChanged", onPositionChanged);
}
