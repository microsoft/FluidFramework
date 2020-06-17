/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { IComponentHTMLView, IComponentHTMLVisual } from "@fluidframework/view-interfaces";
import React from "react";

export interface IEmbeddedComponentProps {
    component: IComponent;
}

/**
 * Abstracts rendering of views as a React component.  Supports React elements, as well as
 * components that implement IComponentReactViewable, IComponentHTMLView, or IComponentHTMLVisual.
 *
 * If the component is none of these, we render nothing.
 */
export class ReactViewAdapter extends React.Component<IEmbeddedComponentProps> {
    /**
     * Test whether the given component can be successfully adapted by a ReactViewAdapter.
     * @param view - the component to test if it is adaptable.
     */
    public static canAdapt(view: IComponent) {
        return (
            React.isValidElement(view)
            || view.IComponentReactViewable !== undefined
            || view.IComponentHTMLView !== undefined
            || view.IComponentHTMLVisual !== undefined
        );
    }

    /**
     * Once we've adapted the view to a React element, we'll retain a reference to render.
     */
    private readonly element: JSX.Element;

    constructor(props: IEmbeddedComponentProps) {
        super(props);

        if (React.isValidElement(this.props.component)) {
            this.element = this.props.component;
            return;
        }

        const reactViewable = this.props.component.IComponentReactViewable;
        if (reactViewable !== undefined) {
            this.element = reactViewable.createJSXElement();
            return;
        }

        const htmlView = this.props.component.IComponentHTMLView;
        if (htmlView !== undefined) {
            this.element = <HTMLViewEmbeddedComponent htmlView={htmlView} />;
            return;
        }

        const htmlVisual = this.props.component.IComponentHTMLVisual;
        if (htmlVisual !== undefined) {
            this.element = <HTMLVisualEmbeddedComponent htmlVisual={htmlVisual} />;
            return;
        }

        this.element = <></>;
    }

    public render() {
        return this.element;
    }
}

interface IHTMLViewProps {
    htmlView: IComponentHTMLView;
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

interface IHTMLVisualProps {
    htmlVisual: IComponentHTMLVisual;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
class HTMLVisualEmbeddedComponent extends React.Component<IHTMLVisualProps> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLVisualProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            const view = this.props.htmlVisual.addView();
            view.render(this.ref.current);
        }
    }

    public render() {
        return <div ref={this.ref}></div>;
    }
}
