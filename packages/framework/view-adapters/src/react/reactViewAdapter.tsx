/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IFluidObject } from "@fluidframework/component-core-interfaces";
import { IComponentHTMLView, IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";

export interface IReactViewAdapterProps {
    /**
     * The view to adapt into a React component.
     */
    view: IComponent & IFluidObject;
}

/**
 * Abstracts rendering of views as a React component.  Supports React elements, as well as
 * components that implement IComponentHTMLView.
 *
 * If the component is none of these, we render nothing.
 */
export class ReactViewAdapter extends React.Component<IReactViewAdapterProps> {
    /**
     * Test whether the given component can be successfully adapted by a ReactViewAdapter.
     * @param view - the component to test if it is adaptable.
     */
    public static canAdapt(view: IComponent & IFluidObject) {
        return (
            React.isValidElement(view)
            || view.IComponentHTMLView !== undefined
            || view.IFluidHTMLView !== undefined
        );
    }

    /**
     * Once we've adapted the view to a React element, we'll retain a reference to render.
     */
    private readonly element: JSX.Element;

    constructor(props: IReactViewAdapterProps) {
        super(props);

        if (React.isValidElement(this.props.view)) {
            this.element = this.props.view;
            return;
        }

        const htmlView = this.props.view.IComponentHTMLView ?? this.props.view.IFluidHTMLView;
        if (htmlView !== undefined) {
            this.element = <HTMLViewEmbeddedComponent htmlView={htmlView} />;
            return;
        }

        this.element = <></>;
    }

    public render() {
        return this.element;
    }
}

interface IHTMLViewProps {
    htmlView: IComponentHTMLView | IFluidHTMLView;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLView
 */
class HTMLViewEmbeddedComponent extends React.Component<IHTMLViewProps> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLViewProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            this.props.htmlView.render(this.ref.current);
        }
    }

    public render() {
        return <div ref={this.ref}></div>;
    }
}
