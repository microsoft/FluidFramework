import { IViewState, View } from "..";
import { Paginator } from "../document/paginator";
import { Editor, IEditorProps } from "../editor";
import { ViewportView } from "../viewport";
export interface IVirtualizedProps extends IEditorProps {
    virtualize: boolean;
}
interface IVirtualizedViewState extends IViewState {
    props: IVirtualizedProps;
    paginator: Paginator;
    docView: Editor;
    viewport: ViewportView;
    virtualized: boolean;
    offsetY: number;
}
export declare class VirtualizedView extends View<IVirtualizedProps, IVirtualizedViewState> {
    readonly cursorPosition: number;
    static readonly factory: () => VirtualizedView;
    private readonly template;
    mounting(props: Readonly<IVirtualizedProps>): IVirtualizedViewState;
    updating(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>): IVirtualizedViewState;
    unmounting(state: Readonly<IVirtualizedViewState>): void;
    private readonly onScroll;
    private ensureVirtualizationMode;
    private getViewportProps;
}
export {};
//# sourceMappingURL=index.d.ts.map