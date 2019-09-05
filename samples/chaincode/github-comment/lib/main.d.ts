/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponentFactory } from "@prague/aqueduct";
import { IComponentHTMLVisual, IComponentHTMLRender } from "@prague/component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { TextareaNoReact } from "@chaincode/textarea-noreact";
import "./styles/github-css-full-rip.css";
export declare class GithubComment extends TextareaNoReact implements IComponentHTMLVisual, IComponentHTMLRender {
    readonly IComponentHTMLVisual: this;
    readonly IComponentHTMLRender: this;
    /**
     * Extension of the parent class function that also forces the innerHTML of
     * the markdown pane to update based on `nT`.
     */
    protected forceDOMUpdate(nT: any, nSS?: any, nSE?: any): Promise<void>;
    /**
     * Draw the HTML view of the element. Invoked by the runtime every time the
     * page is loaded/refreshed.
     *
     * In our case, loads the form HTML from an external HTML snippet and then
     * attaches handlers to the core textarea of the comment form.
     *
     * @param div HTMLDivElement provided by runtime for component to be loaded in
     */
    render(div: HTMLElement): Promise<void>;
    /**
     * Final (static!) load function that allows the runtime to make async calls
     * while creating the object.
     *
     * Primarily boilerplate code.
     */
    static load(runtime: IComponentRuntime, context: IComponentContext): Promise<GithubComment>;
}
/**
 * Note: even though we're extending TextareaNoReact, note that this is a
 * single-line export outside of the class -- we can't even override the
 * equivalent for TextareaNoReact (via importing) and so we have to rewrite
 * essentially the same lines.
 */
export declare const GithubCommentInstantiationFactory: PrimedComponentFactory;
//# sourceMappingURL=main.d.ts.map