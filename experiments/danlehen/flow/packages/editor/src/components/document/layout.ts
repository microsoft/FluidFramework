
export class Layout
{
    constructor (private readonly doc: FlowDocument) { }

    public sync() {
        do {
            // Ensure that we exit the outer do..while loop if there are no remaining segments.
            let nextStart = -1;
            
            context.doc.visitRange((position, segment, startOffset, endOffset) => {
                nextStart = this.syncSegment(context, position, segment, startOffset, endOffset);
    
                // TODO: Halt synchronization once we're off-screen.
    
                // If the 'syncSegment' returned '-1', proceed to the next segment (if any).
                // Otherwise break to the outer 'do..while' loop and we'll restart at the returned
                // 'next' position.
                return nextStart < 0;
            }, start);
    
            start = nextStart;
        } while (start >= 0);
    
        // Notify listeners whose tracked positions were after our rendered window.
        context.notifyTrackedPositionListeners(LayoutContext.getCursorTarget(context.currentInline!.view)!, +Infinity, []);
    
        // Any nodes not re-used from the previous layout are unmounted and removed.
        context.unmount();    
    }
}

public static sync(props: IDocumentProps, state: IDocumentViewState) {
    const paginator = props.paginator;
    const desiredStart = (paginator && paginator.startPosition) || 0;
    let start = (paginator && paginator.startingBlockPosition) || 0;

    console.log(`Sync(${desiredStart}): [${start}..?)`);

    const context = new LayoutContext(
        props.doc,
        state,
        state.slot,
        props.trackedPositions);
    
    do {
        // Ensure that we exit the outer do..while loop if there are no remaining segments.
        let nextStart = -1;
        
        context.doc.visitRange((position, segment, startOffset, endOffset) => {
            nextStart = this.syncSegment(context, position, segment, startOffset, endOffset);

            // TODO: Halt synchronization once we're off-screen.

            // If the 'syncSegment' returned '-1', proceed to the next segment (if any).
            // Otherwise break to the outer 'do..while' loop and we'll restart at the returned
            // 'next' position.
            return nextStart < 0;
        }, start);

        start = nextStart;
    } while (start >= 0);

    // Notify listeners whose tracked positions were after our rendered window.
    context.notifyTrackedPositionListeners(LayoutContext.getCursorTarget(context.currentInline!.view)!, +Infinity, []);

    // Any nodes not re-used from the previous layout are unmounted and removed.
    context.unmount();
}
