# `Ink`

`Ink` is a shared object which holds a collection of ink strokes.

## Creation and setup

To create an `Ink` object, call the static `create` method:

```typescript
const ink = Ink.create(this.runtime, id);
```

You'll also need an `IPen` that will describe the style of your stroke:

```typescript
this.currentPen = {
    color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
    thickness: 7,
};
```

## Usage

_Note: this is subject to change, see the "Next steps" section below_

Once the `Ink` object is created, you can add and update ink strokes.  Most likely you'll want to do this in response to incoming Pointer Events:

```typescript
private handlePointerDown(e: PointerEvent) {
    const createStrokeOp = Ink.makeCreateStrokeOperation(this.currentPen);
    this.currentStrokeId = createStrokeOp.id;
    ink.submitOperation(createStrokeOp);
    handlePointerMotion(e);
}

private handlePointerMotion(e: PointerEvent) {
    const stylusOp = Ink.makeStylusOperation(
        { x: e.clientX, y: e.clientY },
        e.pressure,
        this.currentStrokeId,
    );
    ink.submitOperation(stylusOp);
    this.renderInkOp(stylusOp);
}

canvas.addEventListener("pointerdown", this.handlePointerDown);
canvas.addEventListener("pointermove", this.handlePointerMotion);
canvas.addEventListener("pointerup", this.handlePointerMotion);
```

You can also clear all the ink with a clear operation:

```typescript
const clearOp = Ink.makeClearOperation();
ink.submitOperation(clearOp);
this.renderInkOp(clearOp);
```

To observe and react to ink updates coming from remote participants, you can listen to the `"op"` event:

```typescript
ink.on("op", this.renderInkOp);
```

# Next steps for Ink/Canvases

Ink is an in-progress data structure with the purpose of facilitating collaborative inking.  There is a set of anticipated work to be done still, including breaking changes across Ink, client-ui/InkCanvas, client-ui/OverlayCanvas, and the Canvas component.  Please do try it out and let us know what you think, but also be prepared for the following incoming changes:

## Coordinate bundling
- Make IInkStroke store coordinates rather than ops - now that the type is always "stylus" this doesn't need to be part of the data structure/snapshot
- Enable bundled coordinate updates rather than one per op
- Use PointerEvent.getCoalescedEvents(), along with the bundled coordinate updates to improve rendering fidelity and hang resistance

## Canvas consolidation
- Merge InkCanvas and OverlayCanvas
- Update the Canvas component, FlexView, and FlowContainer to use the merged canvas.

## Wet ink and ink drying
- Distinguish wet/dry ink in the data model
- Add an op for drying a stroke
- Enable wet/dry ink on InkCanvas/OverlayCanvas/canvas

## Atomic stroke rendering
- Enable atomic stroke rendering on the canvases, allowing transparency in ink color (requires wet ink for rendering performance)

## Op management
- Bring op handling into the model, rather than relying on the consumers (InkCanvas/OverlayCanvas) to participate in op handling