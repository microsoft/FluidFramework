import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { FlowDocument } from "@chaincode/flow-document";
import { VirtualizedView } from "@chaincode/flow-editor";
import { Scheduler } from "@prague/flow-util";
import * as style from "./index.css";
import * as ReactDOM from "react-dom";
import { IVirtualizedProps } from "@chaincode/flow-editor";
import { IAppConfig } from "./app";

interface IProps {
    config: IAppConfig;
    docId: string;
    virtualize: boolean;
    cmds: { 
        insert: (element: JSX.Element) => void,
        insertText: (lines: string[]) => void
    };
}

interface IState {
    doc?: FlowDocument;
    editor?: VirtualizedView;
    editorProps?: IVirtualizedProps;
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
        const { config, docId } = this.props;
        DataStore.from(config.serverUrl).then(store => {
            store
                .open<FlowDocument>(docId, "danlehen", FlowDocument.type, [["datastore", Promise.resolve(store)]])
                .then((doc) => {
                    // buildTestParagraph(doc);
                    const editor = new VirtualizedView();
                    const editorProps: IVirtualizedProps = { virtualize: this.props.virtualize, scheduler: new Scheduler(), doc, trackedPositions: [] };
                    editor.mount(editorProps);
                    this.setState({ doc, editor, editorProps });
                });
        });
    }

    render() { return <span className={`${style.fill} ${style.editorPane}`} ref={this.ref}></span> }

    componentDidUpdate() {
        const editor = this.state.editor;
        if (editor) {
            this.state.editorProps.virtualize = this.props.virtualize;
            editor.update(this.state.editorProps);

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
            this.state.doc.insertComponent(position, this.props.config.serverUrl, asAny.docId, asAny.chaincode);
        } else if (asAny.innerHTML) {
            this.state.doc.insertHTML(position, asAny);
        } else {
            // BUGBUG: React components need to be packaged as chaincode, but we'll directly insert as HTML for now
            //         to enable testing.  (This won't persist correctly in the document.)
            const root = document.createElement("span");
            ReactDOM.render(asAny, root);
            this.state.doc.insertHTML(position, root);
        }
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
    }
}