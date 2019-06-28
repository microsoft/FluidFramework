import { Scheduler } from "@prague/flow-util";
import { IViewState, View } from "..";
import { DocumentView, IDocumentProps } from "../document";
import { Cursor } from "./cursor";
export interface IEditorProps extends IDocumentProps {
    scheduler: Scheduler;
    eventSink?: HTMLElement;
}
interface IListenerRegistration {
    target: EventTarget;
    type: string;
    listener: EventListener;
}
interface IEditorViewState extends IViewState {
    cursor: Cursor;
    docView: DocumentView;
    eventSink: Element;
    props: IEditorProps;
    listeners: IListenerRegistration[];
}
export declare class Editor extends View<IEditorProps, IEditorViewState> {
    private readonly cursor;
    readonly doc: import("@chaincode/flow-document").FlowDocument;
    private readonly props;
    readonly cursorPosition: number;
    invalidate: () => void;
    constructor();
    protected mounting(props: Readonly<IEditorProps>): IEditorViewState;
    protected updating(props: Readonly<IEditorProps>, state: IEditorViewState): IEditorViewState;
    protected unmounting(state: IEditorViewState): void;
    private on;
    private readonly render;
    private delete;
    private insertText;
    private horizontalArrow;
    private verticalArrow;
    private readonly onKeyDown;
    private readonly onKeyPress;
    private readonly onMouseDown;
}
export {};
//# sourceMappingURL=index.d.ts.map