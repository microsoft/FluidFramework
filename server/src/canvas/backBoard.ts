import App from "./canvas";
import * as utils from "./utils";

export default class BackBoard {
  public myNameIs: string = "BackBoard Instance";
  public pointerId: number = -1;

  private div: HTMLElement;
  private gesture: MSGesture;

  constructor(private appObject: App, htmlId: string) {
    this.div = utils.id(htmlId);
    // tslint:disable-next-line:no-string-literal
    this.div["sysObject"] = this;

    this.gesture = new MSGesture();
    this.gesture.target = this.div;

    this.div.addEventListener("MSGestureChange", this.gestureListener, false);
    this.div.addEventListener("MSGestureTap", this.gestureListener, false);
    this.div.addEventListener("pointerdown", this.eventListener, false);
  }

  public eventListener(evt) {
    // tslint:disable-next-line:no-string-literal
    let so = this["sysObject"];
    if (so === undefined) {
      // how did we get here?
      // some bubbeling?
    } else {
      // so.pointerId = evt.pointerId;
      if (evt.type === "pointerdown") {
        so.gesture.addPointer(evt.pointerId);
      }
    }
  }

  public gestureListener(evt) {
    if (evt.type === "MSGestureTap") {
      // Unselect everything that is selected
      this.appObject.unselectAll();
      let t = evt.gestureObject.target;
      if (t !== undefined && t !== null) {
        // hide the sheet of glass everything is under
        // it is a div that is the canvas
        utils.makeElementVisible(t, false);
        // try if to get an element from the point
        let elem = <HTMLElement> document.elementFromPoint(evt.clientX, evt.clientY);
        // should we check if this thing is selectable ???
        if (elem.classList.contains("selectable")) {
          // set the selected style on it
          elem.classList.add("stickySelected");
          // put it above the glass
          elem.style.zIndex = "10";
        }

        // make the canvas visible again
        utils.makeElementVisible(t, true);
        evt.stopPropagation();
      }
    }
  }
}
