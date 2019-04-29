import { FlowDocument } from "@chaincode/flow-document";
import { IVirtualizedProps, VirtualizedView } from "@chaincode/flow-editor";
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
    editor?: VirtualizedView;
    editorProps?: IVirtualizedProps;
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

        if (!config.runtime.existing) {
            config.runtime.createAndAttachComponent("document", "@chaincode/flow-document");
        }

        config.runtime.openComponent<FlowDocument>("document", true).then((doc) => {
            // TODO getProcess happens after run is called not before the component is ready. May want to formalize
            // this ready call.
            doc.ready.then(() => {
                // buildTestParagraph(doc);
                const editor = new VirtualizedView();
                const editorProps: IVirtualizedProps = { virtualize: this.props.virtualize, scheduler: new Scheduler(), doc, trackedPositions: [] };
                editor.mount(editorProps);
                this.setState({ doc, editor, editorProps });
            });
        });
    }

    public render() {
        return <span className={`${style.fill} ${style.editorPane}`} ref={this.ref}></span>;
    }

    public componentDidUpdate() {
        const editor = this.state.editor;
        if (editor) {
            this.state.editorProps.virtualize = this.props.virtualize;
            editor.update(this.state.editorProps);

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
