import { FlowViewComponent, IFlowViewComponentState } from "..";
export interface IParagraphProps {
}
export interface IParagraphViewState extends IFlowViewComponentState {
}
export declare class ParagraphView extends FlowViewComponent<IParagraphProps, IParagraphViewState> {
    static readonly factory: () => ParagraphView;
    mounting(props: Readonly<IParagraphProps>): IParagraphViewState;
    updating(props: Readonly<IParagraphProps>, state: Readonly<IParagraphViewState>): IParagraphViewState;
    unmounting(state: Readonly<IParagraphViewState>): void;
}
//# sourceMappingURL=index.d.ts.map