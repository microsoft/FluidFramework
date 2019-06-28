import { FlowViewComponent, IFlowViewComponentState } from "..";
export interface ILineBreakProps {
}
export interface ILineBreakViewState extends IFlowViewComponentState {
}
export declare class LineBreakView extends FlowViewComponent<ILineBreakProps, ILineBreakViewState> {
    static readonly factory: () => LineBreakView;
    mounting(props: Readonly<ILineBreakProps>): ILineBreakViewState;
    updating(props: Readonly<ILineBreakProps>, state: Readonly<ILineBreakViewState>): ILineBreakViewState;
    unmounting(state: Readonly<ILineBreakViewState>): void;
}
//# sourceMappingURL=index.d.ts.map