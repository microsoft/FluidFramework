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
 * Abstracts rendering of components as a React component.  Supports React elements, as well as
 * components that implement IComponentReactViewable, IComponentHTMLView, or IComponentHTMLVisual.
 *
 * If the component is none of these, we render nothing.
 */
export class ReactViewAdapter extends React.Component<IEmbeddedComponentProps> {
    public static canAdapt(component: IComponent) {
        return (
            React.isValidElement(component)
            || component.IComponentReactViewable !== undefined
            || component.IComponentHTMLView !== undefined
            || component.IComponentHTMLVisual !== undefined
        );
    }

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
            this.element = <HTMLViewEmbeddedComponent component={htmlView} />;
            return;
        }

        const htmlVisual = this.props.component.IComponentHTMLVisual;
        if (htmlVisual !== undefined) {
            this.element = <HTMLVisualEmbeddedComponent component={htmlVisual} />;
            return;
        }

        this.element = <></>;
    }

    public render() {
        return this.element;
    }
}

interface IHTMLViewProps {
    component: IComponentHTMLView;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLView
 */
class HTMLViewEmbeddedComponent extends React.Component<IHTMLViewProps, { }> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLViewProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            this.props.component.render(this.ref.current);
        }
    }

    public render() {
        return <div ref={this.ref}></div>;
    }
}

interface IHTMLVisualProps {
    component: IComponentHTMLVisual;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
class HTMLVisualEmbeddedComponent extends React.Component<IHTMLVisualProps, { }> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLVisualProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            const view = this.props.component.addView();
            view.render(this.ref.current);
        }
    }

    public render() {
        return <div ref={this.ref}></div>;
    }
}
