import * as utils from "./utils";

export default class StickyNote {
  private div: HTMLDivElement;
  private gesture: MSGesture;

  constructor(parent: HTMLElement) {

    this.div = <HTMLDivElement> document.createElement("div");     // id("sticky");
    // tslint:disable-next-line:no-string-literal
    this.div["sticky"] = this;

    this.div.classList.add("stickyNote");
    this.div.classList.add("selectable");
    this.div.classList.add("stickySelected");
    // this.div.classList.add("stickyInkable");

    this.div.style.top = "100px";
    this.div.style.left = "100px";

    // tslint:disable-next-line:no-string-literal
    if (window["MSGesture"]) {
      this.gesture = new MSGesture();
      this.gesture.target = this.div;

      this.div.addEventListener("MSGestureChange", (evt) => this.eventListener(evt), false);
      this.div.addEventListener("MSGestureTap", (evt) => this.eventListener(evt), false);
    }

    this.div.addEventListener("pointerdown", (evt) => this.eventListener(evt), false);

    // insert the child into the DOM
    parent.appendChild(this.div);
  }

  public eventListener(evt) {
    // tslint:disable-next-line:no-string-literal
    let sn = this["sticky"];
    if (evt.type === "pointerdown") {
      sn.gesture.addPointer(evt.pointerId);
      return;
    } else if (evt.type === "MSGestureTap") {
      if (evt.target.classList.contains("stickySelected")) {
        evt.target.classList.remove("stickySelected");
        evt.target.style.zIndex = 1;
      } else {
        evt.target.classList.add("stickySelected");
        evt.target.style.zIndex = 10;
      }
      return;
    }
    sn.manipulateElement(evt);
  }

  public manipulateElement(e) {
    // Uncomment the following code if you want to disable the built-in inertia 
    // provided by dynamic gesture recognition

    // if (false && (e.detail == e.MSGESTURE_FLAG_INERTIA))
    //  return;

    // manipulate only with touch
    if (1 || e.pointerType === "touch") {
      // Get the latest CSS transform on the element        
      let m;

      // Get the latest CSS transform on the element in MS Edge 
      m = new WebKitCSSMatrix(window.getComputedStyle(this.gesture.target, null).transform);

      if (m) {
        e.target.style.transform = m
          .translate(e.offsetX, e.offsetY) // Move the transform origin under the center of the gesture
          .rotate(e.rotation * 180 / Math.PI) // Apply Rotation
          .scale(e.scale) // Apply Scale
          .translate(e.translationX, e.translationY) // Apply Translation
          .translate(-e.offsetX, -e.offsetY); // Move the transform origin back

        /* to make it wider instead of bigger [un]comment the scaling above
        let w : number = e.target.clientWidth;
        let h : number = e.target.clientWidth;
        let s : number = e.scale;
        e.target.style.width = (w * s).toString() + "px";
        e.target.style.height = (h * s).toString() + "px";
        */
      }
    }
  }
}
