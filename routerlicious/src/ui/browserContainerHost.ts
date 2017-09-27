import * as ui from "../ui";
import { IComponent } from "./component";
import { debug } from "./debug";

// The majority of this can likely be abstracted behind interfaces - drawing inspiration from other
// UI frameworks. For now we keep it simple and have this class manage the lifetime of the UI framework.

/**
 * Hosts a UI container within the browser
 */
export class BrowserContainerHost {
    private root: IComponent = null;

    public attach(root: IComponent) {
        debug("Attaching new component to browser host");

        if (this.root) {
            throw new Error("A component has already been attached");
        }
        this.root = root;

        window.addEventListener("resize", () => {
            debug("resize");
            const clientRect = document.body.getBoundingClientRect();
            const newSize = ui.Rectangle.fromClientRect(clientRect);
            this.root.resize(newSize);
        });

        document.body.onkeydown = (e) => {
            debug("keydown");
            // TODO
        };

        document.body.onkeypress = (e) => {
            debug("keypress");
            // TODO
        };
    }
}
