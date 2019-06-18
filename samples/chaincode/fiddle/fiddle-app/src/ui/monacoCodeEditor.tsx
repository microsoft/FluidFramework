/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from '@prague/sequence';
import {
  IMergeTreeGroupMsg,
  IMergeTreeInsertMsg,
  IMergeTreeOp,
  IMergeTreeRemoveMsg,
  MergeTreeDeltaType,
} from "@prague/merge-tree";
import * as React from "react";
import * as monaco from "monaco-editor";

// tslint:disable
// setup the monaco environment worker
(self as any).MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		if (label === 'typescript' || label === 'javascript') {
			return './ts.worker.bundle.js';
		}
		return './editor.worker.bundle.js';
	}
}
// tslint:enable

interface p {
  sharedString: SharedString,
  style: React.CSSProperties,
}

interface s {
  sharedString: SharedString;
}

/**
 * Given a shard string and some style this will output a collaborative monaco react component
 */
export class MonacoCodeEditor extends React.PureComponent<p, s> {
  private codeModel;
  private codeEditor;
  private divRef: React.RefObject<HTMLDivElement>;
  constructor(props: p) {
    super(props);

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(defaultCompilerOptions);

    this.state = {
      sharedString: this.props.sharedString,
    }

    this.divRef = React.createRef();
  }

  componentDidMount() {
    const text = this.props.sharedString;
    this.codeModel = monaco.editor.createModel(text.getText(), "javascript");
    this.codeEditor = monaco.editor.create(
      this.divRef.current,
      { model: this.codeModel, automaticLayout: true, scrollBeyondLastLine: false });

    let ignoreModelContentChanges = false;

    this.codeEditor.onDidChangeModelContent((e) => {
      monaco.languages.typescript.getTypeScriptWorker().then((worker) => {
        worker(this.codeModel.uri.toString()).then((client) => {
          client.getEmitOutput(this.codeModel.uri.toString()).then((a) => console.log(a));
        });
      });

      if (ignoreModelContentChanges) {
        return;
      }

      for (const change of e.changes) {
        if (change.text) {
          if (change.rangeLength === 0) {
            text.insertText(change.text, change.rangeOffset);
          } else {
            text.replaceText(change.rangeOffset, change.rangeOffset + change.rangeLength, change.text);
          }
        } else {
          text.removeText(change.rangeOffset, change.rangeOffset + change.rangeLength);
        }
      }
    });

    text.on("op", (op, local) => {
      if (local) {
        return;
      }

      try {
        ignoreModelContentChanges = true;
        this.mergeDelta(op.contents);
      } finally {
        ignoreModelContentChanges = false;
      }
    });
  }

  private mergeDelta(delta: IMergeTreeOp) {
    switch (delta.type) {
      case MergeTreeDeltaType.GROUP:
        this.mergeDeltaGroup(delta as IMergeTreeGroupMsg);
        break;
      case MergeTreeDeltaType.INSERT:
        this.mergeInsertDelta(delta as IMergeTreeInsertMsg);
        break;
      case MergeTreeDeltaType.REMOVE:
        this.mergeRemoveDelta(delta as IMergeTreeRemoveMsg);
        break;
    }
  }

  private mergeDeltaGroup(delta: IMergeTreeGroupMsg): void {
    for (const op of delta.ops) {
      this.mergeDelta(op);
    }
  }

  private mergeInsertDelta(delta: IMergeTreeInsertMsg): void {
    if (typeof delta.pos1 !== "number" ||
      typeof delta.seg !== "string"
    ) {
      return;
    }

    const range = this.offsetsToRange(delta.pos1, delta.pos2);
    const text = delta.seg || "";
    this.codeEditor.executeEdits("remote", [{ range, text }]);
  }

  private mergeRemoveDelta(delta: IMergeTreeRemoveMsg): void {
    if (typeof delta.pos1 !== "number" ||
      typeof delta.pos2 !== "number"
    ) {
      return;
    }

    const range = this.offsetsToRange(delta.pos1, delta.pos2);
    const text = "";
    this.codeEditor.executeEdits("remote", [{ range, text }]);
  }

  private offsetsToRange(offset1: number, offset2?: number): monaco.Range {
    const pos1 = this.codeModel.getPositionAt(offset1);
    const pos2 = (typeof offset2 === "number") ? this.codeModel.getPositionAt(offset2) : pos1;
    const range = new monaco.Range(pos1.lineNumber, pos1.column, pos2.lineNumber, pos2.column);
    return range;
  }

  render() {
    return <div ref={this.divRef} style={this.props.style} className="react-monaco-typescript" />
  }
};

// tslint:disable
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
  // tslint:enable