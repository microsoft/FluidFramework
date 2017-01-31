// private clearCanvas() {
//     this._context.clearRect(0, 0, this._width, this._height);
// }

// private draw() {
//     //nothing to do if we are already drawing
//     if (this._drawing || !this._active || this._index >= this._inkData.length) return;

//     this._drawing = true;

//     var strokeTime = this._inkData[this._index].t;

//     //draw MixInk until we reach lesson time
//     while (strokeTime <= this._currentTime && this._index < this._inkData.length) {
//         this.processAction();

//         if (++this._index >= this._inkData.length) {
//             //MixInking finished
//             this._drawing = false;
//             //this.stop();
//             return;
//         }

//         strokeTime = this._inkData[this._index].t;
//     }

//     this._drawing = false;
// }

// /***
// * processes the MixInk action from MixInk timeline for current index
// * returns: false if the MixInk has ended or doesn't need to be processed, true otherwise
// */
// private processAction() {
//     var action = this._inkData[this._index];

//     // Prepare pen
//     this.updatePen(action.p, action.k === MixPlayerModels.MixInkActionKind.Draw);
//     if (!this._pen) {
//         this._logger.warn("MixInk.pen is not set on processAction");
//         // bad pen data.
//         return;
//     }

//     var shapes: Array<MixInk.IShape>;
//     var scaledDrawPoint: MixInk.IPoint;
//     var stylusPoint: MixInk.IStylusPoint;

//     if (this._pen.b === MixPlayerModels.MixInkBlush.Highlighter) {
//         var scaledWidth = Math.max(1, this._pen.w * this._scaleX);
//         var scaledHeight = Math.max(2, this._pen.h * this._scaleY);

//         scaledDrawPoint = { x: this._scaleX * action.x, y: this._scaleY * action.y };
//         stylusPoint = new MixInk.StylusPoint(scaledDrawPoint, 1, scaledWidth, scaledHeight);

//         //process MixInk action as per the kind
//         switch (action.k) {
//             case MixPlayerModels.MixInkActionKind.Draw:
//                 shapes = this.getHighliterShapes(this._lastStylusPoint, stylusPoint, false);
//                 this._lastStylusPoint = stylusPoint;
//                 break;
//             case MixPlayerModels.MixInkActionKind.Move:
//                 shapes = this.getHighliterShapes(stylusPoint, stylusPoint, true);
//                 this._lastStylusPoint = stylusPoint;
//                 break;
//             case MixPlayerModels.MixInkActionKind.Clear:
//                 this.clearCanvas();
//                 this._lastStylusPoint = null;
//                 break;
//             default:
//                 this._logger.warn("MixInk.unsupported MixInk action. " + action.k);
//                 break;
//         }
//     } else {
//         var scaledThickness = Math.max(1, this._pen.th * Math.max(0.5, this._scaleX));

//         scaledDrawPoint = { x: this._scaleX * action.x, y: this._scaleY * action.y };
//         stylusPoint = new MixInk.StylusPoint(
//             scaledDrawPoint, scaledThickness,
//             MixInkPlayer.defaultHighlighterTipWidth, MixInkPlayer.defaultHighlighterTipHeight);
//         //process MixInk action as per the kind
//         switch (action.k) {
//             case MixPlayerModels.MixInkActionKind.Draw:
//                 shapes = this.getShapes(this._lastStylusPoint, stylusPoint, SegmentCircleInclusive.End);
//                 this._lastStylusPoint = stylusPoint;
//                 break;
//             case MixPlayerModels.MixInkActionKind.Move:
//                 shapes = this.getShapes(stylusPoint, stylusPoint, SegmentCircleInclusive.End);
//                 this._lastStylusPoint = stylusPoint;
//                 break;
//             case MixPlayerModels.MixInkActionKind.Clear:
//                 //clear the canvas
//                 this.clearCanvas();
//                 this._lastStylusPoint = null;
//                 break;
//             default:
//                 this._logger.warn("MixInk.unsupported MixInk action. " + action.k);
//                 break;
//         }
//     }

//     // Render shapes if there is any
//     if (shapes) {
//         shapes.forEach((item: MixInk.IShape) => {
//             this._context.beginPath();
//             item.render(this._context);
//             this._context.closePath();
//             this._context.fill();
//         });
//     }
// }
