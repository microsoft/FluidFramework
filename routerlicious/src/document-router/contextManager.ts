import { IContext } from "../kafka-service/lambdas";
import { DocumentContext } from "./documentContext";

// Maybe I should merge the context into the document

export class DocumentContextManager {
    public get maxOffset() {
        return this.maxOffsetInternal;
    }

    private contexts: DocumentContext[] = [];
    private maxOffsetInternal: number;

    constructor(private partitionContext: IContext) {
    }

    public trackContext(context: DocumentContext) {
        this.contexts.push(context);
        context.addListener("checkpoint", () => this.updateCheckpoint());
    }

    public setMaxOffset(value: number) {
        this.maxOffsetInternal = value;
    }

    private updateCheckpoint() {
        let offset = this.maxOffset;
        this.contexts.forEach((context) => {
            // Adjust context if document is not caught up
            if (context.offset !== undefined && context.offset !== context.maxOffset) {
                offset = Math.min(offset, context.offset);
            }
        });

        if (offset !== undefined) {
            this.partitionContext.checkpoint(offset);
        }
    }
}
