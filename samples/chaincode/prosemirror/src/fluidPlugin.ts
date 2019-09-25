import { Plugin, Transaction } from "prosemirror-state";
import { SharedString } from "@prague/sequence";
import { EditorView } from "prosemirror-view";
import { MergeTreeDeltaType, TextSegment, Marker } from "@prague/merge-tree";

export class FluidCollabPlugin {
    public readonly plugin: Plugin;

    constructor(private readonly sharedString: SharedString) {
        this.plugin = new Plugin({
            state: {
                init: (config, instance) => {
                    return null;
                },
                apply: (tr, old) => {
                    this.applyTransaction(tr);
                    return null;
                }
            },
        });
    }

    public attachView(editorView: EditorView) {
        this.sharedString.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                const transaction = editorView.state.tr;

                for (const range of ev.ranges) {
                    const segment = range.segment;

                    if (range.operation === MergeTreeDeltaType.INSERT) {
                        if (TextSegment.is(segment)) {
                            transaction.insertText(segment.text, range.position);
                        } else if (Marker.is(segment)) {
                            // doc.replaceRange(
                            //     "\n",
                            //     doc.posFromIndex(range.position));
                        }
                    } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                        if (TextSegment.is(segment)) {
                            // doc.replaceRange(
                            //     "",
                            //     doc.posFromIndex(range.position),
                            //     doc.posFromIndex(range.position + textSegment.text.length));
                        } else if (Marker.is(segment)) {
                            // doc.replaceRange(
                            //     "",
                            //     doc.posFromIndex(range.position),
                            //     doc.posFromIndex(range.position + 1));
                        }
                    }
                }

                transaction.setMeta("fluid-local", true);

                editorView.dispatch(transaction);
            });

    }

    private applyTransaction(tr: Transaction<any>) {
        if (tr.getMeta("fluid-local")) {
            return;
        }

        for (const step of tr.steps) {
            // This is a good place for me to tweak changes and ignore local stuff...
            console.log(JSON.stringify(step, null, 2));

            const stepAsJson = step.toJSON();
            if (stepAsJson.stepType !== "replace") {
                break;
            }

            // TODO flatten content
            // type: hard_break is a shift+enter
            // type: text is text
            const text = stepAsJson.slice.content[0].text;
            if (!text) {
                break;
            }

            this.sharedString.insertText(stepAsJson.from, text);
        }
    }
}
