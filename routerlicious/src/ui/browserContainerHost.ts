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

        // Throttle the resizes?

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

// export default class BackBoard extends ui.Component {
//     public myNameIs: string = "BackBoard Instance";
//     public pointerId: number = -1;
//     private gesture: MSGesture;

//     constructor(element: HTMLDivElement, private appObject: Canvas, htmlId: string) {
//       super(element);

//       // tslint:disable-next-line:no-string-literal
//       this.element["sysObject"] = this;

//       // tslint:disable-next-line:no-string-literal
//       if (window["MSGesture"]) {
//         this.gesture = new MSGesture();
//         this.gesture.target = this.element;

//         this.element.addEventListener("MSGestureChange", (evt) => this.gestureListener(evt), false);
//         this.element.addEventListener("MSGestureTap", (evt) => this.gestureListener(evt), false);
//       }

//       this.element.addEventListener("pointerdown", (evt) => this.eventListener(evt), false);
//     }

//     public eventListener(evt) {
//       // tslint:disable-next-line:no-string-literal
//       let so = this["sysObject"];
//       if (so === undefined) {
//         // how did we get here?
//         // some bubbeling?
//       } else {
//         // so.pointerId = evt.pointerId;
//         if (evt.type === "pointerdown") {
//           if (so.gesture) {
//             so.gesture.addPointer(evt.pointerId);
//           }
//         }
//       }
//     }

//     public gestureListener(evt) {
//       if (evt.type === "MSGestureTap") {
//         // Unselect everything that is selected
//         this.appObject.unselectAll();
//         let t = evt.gestureObject.target;
//         if (t !== undefined && t !== null) {
//           // hide the sheet of glass everything is under
//           // it is a div that is the canvas
//           ui.makeElementVisible(t, false);
//           // try if to get an element from the point
//           let elem = <HTMLElement> document.elementFromPoint(evt.clientX, evt.clientY);
//           // should we check if this thing is selectable ???
//           if (elem.classList.contains("selectable")) {
//             // set the selected style on it
//             elem.classList.add("stickySelected");
//             // put it above the glass
//             elem.style.zIndex = "10";
//           }

//           // make the canvas visible again
//           ui.makeElementVisible(t, true);
//           evt.stopPropagation();
//         }
//       }
//     }
//   }
