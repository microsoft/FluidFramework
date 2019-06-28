import { FlowViewComponent, IFlowViewComponentState } from "..";
export interface ITextProps {
    text: string;
}
export interface ITextViewState extends IFlowViewComponentState {
}
export declare class TextView extends FlowViewComponent<ITextProps, ITextViewState> {
    static readonly factory: () => TextView;
    mounting(props: Readonly<ITextProps>): ITextViewState;
    updating(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState;
    unmounting(state: Readonly<ITextViewState>): void;
}
//# sourceMappingURL=index.d.ts.map