import {
    ICustomMarkdownEmitterOptions as BaseEmitterOptions,
    CustomMarkdownEmitter as BaseMarkdownEmitter,
} from "@microsoft/api-documenter/lib/markdown/CustomMarkdownEmitter";
import { IMarkdownEmitterContext } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { IndentedWriter } from "@microsoft/api-documenter/lib/utils/IndentedWriter";
import { ApiModel } from "@microsoft/api-extractor-model";
import { DocNode } from "@microsoft/tsdoc";

import { DocHeading } from "./doc-nodes";
import { CustomDocNodeKind } from "./doc-nodes/CustomDocNodeKind";

export interface EmitterOptions extends BaseEmitterOptions {
    headingLevel: number;
}

export type EmitterContext = IMarkdownEmitterContext<EmitterOptions>;

export class MarkdownEmitter extends BaseMarkdownEmitter {
    public constructor(apiModel: ApiModel) {
        super(apiModel);
    }

    /**
     * @override
     */
    public override writeNode(
        docNode: DocNode,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        switch (docNode.kind) {
            case CustomDocNodeKind.Heading: {
                const docHeading: DocHeading = docNode as DocHeading;
                writer.ensureSkippedLine();

                let prefix: string;
                switch (docHeading.level) {
                    case 1:
                        prefix = "#";
                        break;
                    case 2:
                        prefix = "##";
                        break;
                    case 3:
                        prefix = "###";
                        break;
                    case 4:
                        prefix = "####";
                        break;
                    case 5:
                        prefix = "#####";
                        break;
                    default:
                        // If we are beyond the maximum heading level, write out contents bolded on their own line.
                        super.writePlainText(docHeading.title, {
                            ...context,
                            boldRequested: true,
                        });
                        writer.writeLine();
                        return;
                }
                let suffix: string = "";
                if (docHeading.id !== "") {
                    suffix = ` {#${docHeading.id}}`;
                }

                writer.writeLine(prefix + " " + this.getEscapedText(docHeading.title) + suffix);
                writer.writeLine();
                break;
            }
            default:
                super.writeNode(docNode, context, docNodeSiblings);
        }
    }
}
