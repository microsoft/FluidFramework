import { FlowDocument } from "@chaincode/flow-document";
import { Editor, IEditorProps } from "@chaincode/flow-editor";
import { Scheduler } from "@prague/flow-util";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IAppConfig } from "./app";
import * as style from "./index.css";

interface IProps {
    config: IAppConfig;
    virtualize: boolean;
    cmds: {
        insert: (element: JSX.Element) => void,
        insertText: (lines: string[]) => void,
        insertContainerComponent: (pkg: string) => void,
    };
}

interface IState {
    doc?: FlowDocument;
    editor?: Editor;
    props?: IEditorProps;
}

export class FlowEditor extends React.Component<IProps, IState> {
    private readonly ref = React.createRef<HTMLDivElement>();

    constructor(props: Readonly<IProps>) {
        super(props);
        this.state = {};
        this.props.cmds.insert = this.insert;
        this.props.cmds.insertText = this.insertText;
        this.props.cmds.insertContainerComponent = this.insertContainerComponent;
    }

    public componentWillMount() {
        const { config } = this.props;

        config.doc.then((doc) => {
            const editor = new Editor();
            const props: IEditorProps = {
                scheduler: new Scheduler(),
                doc,
                trackedPositions: [],
                eventSink: this.ref.current,
            };
            editor.mount(props);
            this.setState({ doc, editor, props });
        });
    }

    public render() {
        return <div className={`${style.fill} ${style.editorPane}`} tabIndex={0} ref={this.ref}></div>;
    }

    public componentDidUpdate() {
        const editor = this.state.editor;
        if (editor) {
            editor.update(this.state.props);

            const parent = this.ref.current;
            if (parent.firstElementChild && parent.firstElementChild !== editor.root) {
                parent.replaceChild(editor.root, parent.firstElementChild);
            } else {
                parent.appendChild(editor.root);
            }
        }
    }

    public insert = (inclusion: JSX.Element | HTMLElement | { docId: string, chaincode?: string }) => {
        const position = this.state.editor.cursorPosition;
        const asAny = inclusion as any;

        if (asAny.chaincode) {
            this.state.doc.insertComponent(position, null /* this.props.config.serverUrl */, asAny.docId, asAny.chaincode);
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

    public insertContainerComponent = (pkg: string) => {
        const position = this.state.editor.cursorPosition;
        // tslint:disable-next-line:insecure-random
        this.state.doc.insertInclusionComponent(position, Math.random().toString(36).substr(2, 4), pkg);
    }

    public insertText = (lines: string[]) => {
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
