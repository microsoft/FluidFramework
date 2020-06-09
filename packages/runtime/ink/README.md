# @fluidframework/ink

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

Once the `Ink` object is created, you can add and update ink strokes using `createStroke` and `appendPointToStroke`.  Most likely you'll want to do this in response to incoming Pointer Events:

```typescript
private handlePointerDown(e: PointerEvent) {
    const newStroke = ink.createStroke(this.currentPen);
    this.currentStrokeId = newStroke.id;
    handlePointerMotion(e);
}

private handlePointerMotion(e: PointerEvent) {
    const inkPoint = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        pressure: e.pressure,
    };
    ink.appendPointToStroke(inkPoint, this.currentStrokeId);
}

canvas.addEventListener("pointerdown", this.handlePointerDown);
canvas.addEventListener("pointermove", this.handlePointerMotion);
canvas.addEventListener("pointerup", this.handlePointerMotion);
```

You can also clear all the ink with `clear`:

```typescript
ink.clear();
```

To observe and react to changes to the ink from both your own modifications as well as remote participants, you can listen to the `"createStroke"`, `"stylus"` and `"clear"` events.  Since you don't need to render anything yet when a stroke is first created, registering for `"createStroke"` may not be necessary.

```typescript
ink.on("stylus", this.renderStylusUpdate.bind(this));
ink.on("clear", this.renderClear.bind(this));
```

# Next steps for Ink/Canvases

Ink is an in-progress data structure with the purpose of facilitating collaborative inking.  There is a set of anticipated work to be done still, including breaking changes across Ink, client-ui-lib/OverlayCanvas, and the Canvas component.  Please do try it out and let us know what you think, but also be prepared for the following incoming changes:

## Coordinate bundling
- Enable bundled coordinate updates rather than one per op
- Use PointerEvent.getCoalescedEvents(), along with the bundled coordinate updates to improve rendering fidelity and hang resistance

## Canvas consolidation
- Replace client-ui-lib's OverlayCanvas with ink's InkCanvas, or remove it.
- Consider splitting the new InkCanvas control into input/output, to enable reuse of input handling across multiple renderers.

## Wet ink and ink drying
- Distinguish wet/dry ink in the data model
- Add an op for drying a stroke
- Enable wet/dry ink on OverlayCanvas/canvas

## Atomic stroke rendering
- Enable atomic stroke rendering on the canvases, allowing transparency in ink color (requires wet ink for rendering performance)
