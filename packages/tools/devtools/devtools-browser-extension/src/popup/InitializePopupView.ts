import React from "react";
import ReactDOM from "react-dom";
import { PopupView } from "./PopupView";

/**
 * Renders the Fluid Popup view into the provided target element.
 *
 * @param target - The element into which the devtools view will be rendered.
 */
export async function initializePopupView(target: HTMLElement): Promise<void> {
	ReactDOM.render(React.createElement(PopupView), target, () => {
		console.log("Rendered Popup view in devtools window!");
	});
}
