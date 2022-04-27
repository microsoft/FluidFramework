/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import {
    MergeTreeDeltaType,
    TextSegment,
} from "@fluidframework/merge-tree";
import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence";
import * as monaco from "monaco-editor";
import React, { useEffect, useRef } from "react";

/**
 * Compilation options for Monaco to use on Typescript
 */
const defaultCompilerOptions = {
    noImplicitAny: true,
    strictNullChecks: true,
    strictFunctionTypes: true,
    strictPropertyInitialization: true,
    noImplicitThis: true,
    noImplicitReturns: true,

    alwaysStrict: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,

    downlevelIteration: false,
    noEmitHelpers: false,
    noLib: false,
    noStrictGenericChecks: false,
    noUnusedLocals: false,
    noUnusedParameters: false,

    esModuleInterop: false,
    preserveConstEnums: false,
    removeComments: false,
    skipLibCheck: false,

    experimentalDecorators: false,
    emitDecoratorMetadata: false,

    target: monaco.languages.typescript.ScriptTarget.ES2015,
    jsx: monaco.languages.typescript.JsxEmit.None,

    allowNonTsExtensions: true,
};

export interface IMonacoViewProps {
    sharedString: SharedString;
}

export const MonacoView: React.FC<IMonacoViewProps> = (props: IMonacoViewProps) => {
    const { sharedString } = props;
    const viewElementRef = useRef<HTMLDivElement>(null);
    const codeModelRef = useRef<monaco.editor.ITextModel>(null);
    const outputModelRef = useRef<monaco.editor.ITextModel>(null);
    const codeEditorRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
    const ignoreModelContentChanges = useRef<boolean>(false);

    // Should only need to set the compiler options once ever
    useEffect(() => {
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(defaultCompilerOptions);
    }, []);

    // If the sharedString we're using for the model is ever rebound to a different shared string, we need to throw
    // all the monaco stuff away, recreate it, and reregister all event listeners appropriately.
    // TODO: There is probably some cleanup that should happen on the monaco resources that we are throwing away.
    useEffect(() => {
        codeModelRef.current = monaco.editor.createModel(sharedString.getText(), "typescript");
        outputModelRef.current = monaco.editor.createModel("", "javascript");
        codeEditorRef.current = monaco.editor.create(
            viewElementRef.current,
            { model: codeModelRef.current, automaticLayout: true },
        );

        codeEditorRef.current.onDidChangeModelContent((e) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            monaco.languages.typescript.getTypeScriptWorker().then((worker) => {
                worker(codeModelRef.current.uri.toString()).then((client) => {
                    client.getEmitOutput(codeModelRef.current.uri.toString()).then((r) => {
                        outputModelRef.current.setValue(r.outputFiles[0].text);
                    });
                });
            });

            if (ignoreModelContentChanges.current) {
                return;
            }

            for (const change of e.changes) {
                if (change.text) {
                    if (change.rangeLength === 0) {
                        sharedString.insertText(change.rangeOffset, change.text);
                    } else {
                        sharedString.replaceText(
                            change.rangeOffset,
                            change.rangeOffset + change.rangeLength,
                            change.text,
                        );
                    }
                } else {
                    sharedString.removeText(change.rangeOffset, change.rangeOffset + change.rangeLength);
                }
            }
        });

        sharedString.on("sequenceDelta", (ev: SequenceDeltaEvent) => {
            if (ev.isLocal) {
                return;
            }

            try {
                // Attempt to merge the ranges
                ignoreModelContentChanges.current = true;

                /**
                 * Translate the offsets used by the MergeTree into a Range that is
                 * interpretable by Monaco.
                 * @param offset1 Starting offset
                 * @param offset2 Ending offset
                 */
                const offsetsToRange = (offset1: number, offset2?: number): monaco.Range => {
                    const pos1 = codeModelRef.current.getPositionAt(offset1);
                    const pos2 = (typeof offset2 === "number") ? codeModelRef.current.getPositionAt(offset2) : pos1;
                    const range = new monaco.Range(pos1.lineNumber, pos1.column, pos2.lineNumber, pos2.column);
                    return range;
                };

                for (const range of ev.ranges) {
                    const segment = range.segment;
                    if (TextSegment.is(segment)) {
                        switch (range.operation) {
                            case MergeTreeDeltaType.INSERT: {
                                const posRange = offsetsToRange(range.position);
                                const text = segment.text || "";
                                codeEditorRef.current.executeEdits("remote", [{ range: posRange, text }]);
                                break;
                            }

                            case MergeTreeDeltaType.REMOVE: {
                                const posRange = offsetsToRange(range.position, range.position + segment.text.length);
                                const text = "";
                                codeEditorRef.current.executeEdits("remote", [{ range: posRange, text }]);
                                break;
                            }

                            default:
                                break;
                        }
                    }
                }
            } finally {
                ignoreModelContentChanges.current = false;
            }
        });
    }, [sharedString]);

    return <div style={{ minHeight: "480px", width: "100%", height: "100%" }} ref={ viewElementRef }></div>;
};
