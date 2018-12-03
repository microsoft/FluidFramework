import * as React from "react";
import { DataStore } from "@prague/datastore";
import { FlowDocument } from "@chaincode/flow-document";
import { Editor, Scheduler } from "@prague/flow-editor";
import * as style from "./index.css";
import * as ReactDOM from "react-dom";

interface IProps {
    docId: string;
    docUrl: string;
    cmds: { insert: (element: JSX.Element) => void };
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
    }

    componentWillMount() {
        const { docUrl, docId } = this.props;
        DataStore.From(docUrl).then(store => {
            store
                .open<FlowDocument>(docId, "danlehen", "@chaincode/flow-document@latest")
                .then((doc) => {
                    buildTestParagraph(doc);
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

    insert = (element: JSX.Element) => {
        const root = document.createElement("span");
        ReactDOM.render(element, root);
        this.state.doc.insertInclusion(this.state.editor.cursorPosition, root);
        this.state.editor.invalidate();
    }
}

const buildTestParagraph = (doc: FlowDocument) => {
    doc.insertText(0, `Because AmigaOS was rather buggy at the time of the A1000's release, the OS was not placed in ROM then. Instead, the A1000 includes a daughterboard with 256 KB of RAM, dubbed the "writable control store" (WCS), into which the core of the operating system is loaded from floppy disk (this portion of the operating system is known as the "Kickstart"). The WCS is write-protected after loading, and system resets do not require a reload of the WCS. In Europe, the WCS was often referred to as WOM (Write Once Memory), a play on the more conventional term "ROM" (read-only memory).`);
    doc.insertParagraph(0);
    doc.insertText(0, `The A1000 has a number of characteristics that distinguish it from later Amiga models: It is the only model to feature the short-lived Amiga check-mark logo on its case, the majority of the case is elevated slightly to give a storage area for the keyboard when not in use (a "keyboard garage"), and the inside of the case is engraved with the signatures of the Amiga designers (similar to the Macintosh); including Jay Miner and the paw print of his dog Mitchy. The A1000's case was designed by Howard Stolz.[6] As Senior Industrial Designer at Commodore, Stolz was the mechanical lead and primary interface with Sanyo in Japan, the contract manufacturer for the A1000 casing.[7]`);
    doc.insertParagraph(0);
    doc.insertText(0, "The Commodore Amiga 1000, also known as the A1000 and originally simply as the Amiga, is the first personal computer released by Commodore International in the Amiga line. It combines the 16/32-bit Motorola 68000 CPU which was powerful by 1985 standards with one of the most advanced graphics and sound systems in its class, and runs a preemptive multitasking operating system that fits into 256 KB of read-only memory[1][4][5] and shipped with 256 KB of RAM.[2] The primary memory can be expanded internally with a manufacturer-supplied 256 KB module for a total of 512 KB of RAM. Using the external slot the primary memory can be expanded up to 8.5 MB.[2]");
}