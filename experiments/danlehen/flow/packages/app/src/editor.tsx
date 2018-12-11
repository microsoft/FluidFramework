import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { FlowDocument } from "@chaincode/flow-document";
import { Editor, Scheduler } from "@prague/flow-editor";
import * as style from "./index.css";
import * as ReactDOM from "react-dom";

interface IProps {
    docId: string;
    docUrl: string;
    cmds: { 
        insert: (element: JSX.Element) => void,
        insertText: (lines: string[]) => void
    };
}

interface IState {
    doc?: FlowDocument;
    editor?: Editor;
}

export class FlowEditor extends React.Component<IProps, IState> {
    private readonly ref = React.createRef<HTMLDivElement>();

    constructor(props: Readonly<IProps>) {
        super(props)
        this.state = {};
        this.props.cmds.insert = this.insert;
        this.props.cmds.insertText = this.insertText;
    }

    componentWillMount() {
        const { docUrl, docId } = this.props;
        DataStore.From(docUrl).then(store => {
            store
                .open<FlowDocument>(docId, "danlehen", "@chaincode/flow-document@latest")
                .then((doc) => {
                    // buildTestParagraph(doc);
                    const editor = new Editor(new Scheduler(), doc);
                    this.setState({ doc, editor });
                });
        });
    }

    render() { return <span className={`${style.fill} ${style.editorPane}`} ref={this.ref}></span> }

    componentDidUpdate() {
        const editor = this.state.editor;
        if (editor) {
            const parent = this.ref.current;
            if (parent.firstElementChild && parent.firstElementChild !== editor.root) {
                parent.replaceChild(editor.root, parent.firstElementChild);
            } else {
                parent.appendChild(editor.root)
            }
        }
    }

    insert = (inclusion: JSX.Element | HTMLElement | { docId: string, chaincode?: string }) => {
        const position = this.state.editor.cursorPosition;
        const asAny = inclusion as any;
        
        if (asAny.chaincode) {
            this.state.doc.insertComponent(position, asAny.docId, asAny.chaincode);
        } else if (asAny.innerHTML) {
            this.state.doc.insertHTML(position, asAny);
        } else {
            // BUGBUG: React components need to be packaged as chaincode, but we'll directly insert as HTML for now
            //         to enable testing.  (This won't persist correctly in the document.)
            const root = document.createElement("span");
            ReactDOM.render(asAny, root);
            this.state.doc.insertHTML(position, root);   
        }

        this.state.editor.invalidate();
    }

    insertText = (lines: string[]) => {
        const position = this.state.editor.cursorPosition;
        const doc = this.state.doc;
        for (let i = lines.length - 1; i >= 0; i--) {
            doc.insertText(position, lines[i]);
            if (i !== 0) {
                doc.insertParagraph(position);
            }
        }

        this.state.editor.invalidate();
    }
}