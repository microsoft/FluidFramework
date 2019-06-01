import { Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";

// tslint:disable:no-empty-interface
export interface ISimpleTemplateProps { }
export interface ISimpleTemplateViewState extends IViewState {}

export class SimpleTemplateView extends FlowViewComponent<ISimpleTemplateProps, ISimpleTemplateViewState> {
    constructor(private readonly template: Template) { super(); }

    public mounting(): ISimpleTemplateViewState {
        return { root: this.template.clone() };
    }

    public get cursorTarget() { return this.template.get(this.root, "cursorTarget").firstChild; }

    public updating(props: Readonly<ISimpleTemplateProps>, state: Readonly<ISimpleTemplateViewState>): ISimpleTemplateViewState {
        return state;
    }

    public unmounting() { /* do nothing */ }
}
