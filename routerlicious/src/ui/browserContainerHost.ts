import * as ui from "../ui";
import { Component } from "./component";
import { debug } from "./debug";

// The majority of this can likely be abstracted behind interfaces - drawing inspiration from other
// UI frameworks. For now we keep it simple and have this class manage the lifetime of the UI framework.

/**
 * Hosts a UI container within the browser
 */
export class BrowserContainerHost {
    private root: Component = null;

    public attach(root: Component) {
        debug("Attaching new component to browser host");

        // Make note of the root node
        if (this.root) {
            throw new Error("A component has already been attached");
        }
        this.root = root;

        // Listen for resize messages and propagate them to child elements
        window.addEventListener("resize", () => {
            debug("resize");
            this.resize();
        });

        // Input event handling
        document.body.onkeydown = (e) => {
            debug("keydown");
            this.root.emit("keydown", e);
        };

        document.body.onkeypress = (e) => {
            debug("keypress");
            this.root.emit("keypress", e);
        };

        // Remove any existing children and attach ourselves
        while (document.body.hasChildNodes()) {
            document.body.removeChild(document.body.lastChild);
        }
        document.body.appendChild(root.element);

        // Trigger initial resize due to attach
        this.resize();
    }

    private resize() {
        const clientRect = document.body.getBoundingClientRect();
        const newSize = ui.Rectangle.fromClientRect(clientRect);
        newSize.conformElement(this.root.element);
        this.root.resize(newSize);
    }
}
