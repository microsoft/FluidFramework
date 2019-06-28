import { FlowViewComponent, IFlowViewComponentState } from "..";
export interface IInclusionProps {
    child: Node;
}
export interface IInclusionViewState extends IFlowViewComponentState {
}
/**
 * Returns true if the given event has bubbled up from an inclusion.  Used by FlowEditor to avoid
 * hijacking events that should bubble to document/window for default action or dispatch by synthetic
 * event handlers (e.g., React).
 */
export declare function shouldIgnoreEvent(e: Event): true | undefined;
export declare class InclusionView extends FlowViewComponent<IInclusionProps, IInclusionViewState> {
    static readonly factory: () => InclusionView;
    mounting(props: Readonly<IInclusionProps>): IInclusionViewState;
    updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState;
    unmounting(state: Readonly<IInclusionViewState>): void;
}
//# sourceMappingURL=index.d.ts.map