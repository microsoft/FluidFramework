/// <reference path="utils.ts"/>

interface PtrEvtPoint {
  x: number;
  y: number;
}

interface PointerPointProps {
  isEraser: boolean;
}

class EventPoint {
  rawPosition: PtrEvtPoint;
  properties: PointerPointProps;

  constructor(evt: PointerEvent) {
    this.rawPosition = { x: evt.x, y: evt.y };
    this.properties = { isEraser: false };
  }
}

class InkCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  penID: number = -1;
  gesture: MSGesture;

  // constructor

  constructor(parent: HTMLElement) {
    // setup canvas
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('drawSurface');
    parent.appendChild(this.canvas);
    this.canvas['inkCanvas'] = this;
    // get context
    this.context = this.canvas.getContext("2d");

    var w: number = this.canvas.offsetWidth;
    var h: number = this.canvas.offsetHeight;

    // set the width and height specified through CSS
    this.canvas.setAttribute("width", w.toString());
    this.canvas.setAttribute("height", h.toString());

    var bb = false;
    this.canvas.addEventListener("pointerdown", this.handlePointerDown, bb);
    this.canvas.addEventListener("pointermove", this.handlePointerMove, bb);
    this.canvas.addEventListener("pointerup", this.handlePointerUp, bb);
  }
  // Stubs for bunch of functions that are being called in the code below
  // this will make it easier to fill some code in later or just delete them
  tempEraseMode() { }
  restoreMode() { }
  renderAllStrokes() { }
  anchorSelection() { }
  
  
  selectAll() { }
  inkMode() { }
  inkColor() { }
  
  anySelected(): boolean { return false; }


  undo() { }
  redo() { }

  // We will accept pen down or mouse left down as the start of a stroke.
  // We will accept touch down or mouse right down as the start of a touch.
  handlePointerDown(evt) {
    var ic = this['inkCanvas'];
    ic.penID = evt.pointerId;

    if (evt.pointerType === "touch") {
      // ic.gesture.addPointer(evt.pointerId);
    }

    if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
      // Anchor and clear any current selection.
      ic.anchorSelection();
      var pt = new EventPoint(evt);

      if (pt.properties.isEraser) { // The back side of a pen, which we treat as an eraser
        ic.tempEraseMode();
      } else {
        ic.restoreMode();
      }

      ic.context.beginPath();
      ic.context.moveTo(pt.rawPosition.x, pt.rawPosition.y);

      var pressureWidth = evt.pressure * 15;
      ic.context.lineWidth = pressureWidth;
      evt.returnValue = false;
    }
  }

  handlePointerMove(evt) {
    var ic = this['inkCanvas'];
    if (evt.pointerId === ic.penID) {
      var pt = new EventPoint(evt);
      var w = 8;
      var h = 8;

      if (evt.pointerType == "touch") {
        ic.context.strokeStyle = "gray";
        w = evt.width;
        h = evt.height;
        // context.strokeRect(evt.x - w/2 - 1, evt.y - h/2 -1 , w+1, h+1);
        ic.context.clearRect(evt.x - w / 4, evt.y - h / 4, w / 2, h / 2);
        evt.returnValue = false;
        return false; // we're going to clearRect instead
        
      }

      if (evt.pointerType == "pen") {
        ic.context.strokeStyle = "rgba(0, 50, 0,  1)";
        w = w * (0.1 + evt.pressure);
        h = h * (0.1 + evt.pressure);
      } else { // just mouse  
        ic.context.strokeStyle = "rgba(250, 0, 0, 0.5)";
      }

      ic.context.lineWidth = w;
      ic.context.lineTo(evt.clientX, evt.clientY);
      ic.context.stroke();
      evt.returnValue = false;
      
      //var pts = evt.intermediatePoints;
      //for (var i = pts.length - 1; i >= 0 ; i--) {
      //}
    }
    return false;
  }

  handlePointerUp(evt) {
    var ic = this['inkCanvas'];
    if (evt.pointerId === ic.penID) {
      ic.penID = -1;
      var pt = new EventPoint(evt);
      // ic.context.lineTo(pt.rawPosition.x, pt.rawPosition.y);
      // ic.context.stroke();
      ic.context.closePath();
      ic.renderAllStrokes();
      evt.returnValue = false;
      
    }
    return false;
  }

  // We treat the event of the pen leaving the canvas as the same as the pen lifting;
  // it completes the stroke.
  handlePointerOut(evt) {
    var ic = this['inkCanvas'];
    if (evt.pointerId === ic.penID) {
      var pt = new EventPoint(evt);
      ic.context.lineTo(pt.rawPosition.x, pt.rawPosition.y);
      ic.context.stroke();
      ic.context.closePath();
      ic.penID = -1;
      ic.renderAllStrokes();
      
    }
    return false;
  }

  handleTap(evt) {
    // Anchor and clear any current selection.
    var ic = this['inkCanvas'];
    if (ic.anySelected()) {
      ic.anchorSelection();
      ic.renderAllStrokes();
    }
    return false;
  }

  clear() {
    if (this.anySelected()) {

    } else {
      this.selectAll();
      this.inkMode();
    }

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderAllStrokes();
    displayStatus("");
    displayError("");
  }
}
