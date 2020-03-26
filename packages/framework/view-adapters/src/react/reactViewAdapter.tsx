/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import { IComponentHTMLView, IComponentHTMLVisual, IComponentReactViewable } from "../interfaces";

export interface IEmbeddedComponentProps {
    component: IComponent;
    style?: React.CSSProperties;
}

/**
 * Abstracts rendering of components as a React component.  Supports React elements, as well as
 * components that implement IComponentReactViewable, IComponentHTMLView, or IComponentHTMLVisual.
 *
 * If the component is none of these, we render an empty <span />
 */
export class ReactViewAdapter extends React.Component<IEmbeddedComponentProps> {
    private readonly element: JSX.Element;

    constructor(props: IEmbeddedComponentProps) {
        super(props);

        if (React.isValidElement(this.props.component)) {
            this.element = this.props.component;
            return;
        }

        const reactViewable = this.props.component.IComponentReactViewable;
        if (reactViewable !== undefined) {
            this.element = <ReactEmbeddedComponent component={reactViewable}/>;
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

        this.element = <span />;
    }

    public render() {
        return this.element;
    }
}

interface IHTMLViewProps {
    component: IComponentHTMLView;
    style?: React.CSSProperties;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLView
 */
class HTMLViewEmbeddedComponent extends React.Component<IHTMLViewProps, { }> {
    private readonly ref: React.RefObject<HTMLSpanElement>;

    constructor(props: IHTMLViewProps) {
        super(props);

        this.ref = React.createRef<HTMLSpanElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            this.props.component.render(this.ref.current);
        }
    }

    public render() {
        return <span style={this.props.style} ref={this.ref}></span>;
    }
}

interface IHTMLVisualProps {
    component: IComponentHTMLVisual;
    style?: React.CSSProperties;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
class HTMLVisualEmbeddedComponent extends React.Component<IHTMLVisualProps, { }> {
    private readonly ref: React.RefObject<HTMLSpanElement>;

    constructor(props: IHTMLVisualProps) {
        super(props);

        this.ref = React.createRef<HTMLSpanElement>();
    }

    public async componentDidMount() {
        // eslint-disable-next-line no-null/no-null
        if (this.ref.current !== null) {
            const view = this.props.component.addView();
            view.render(this.ref.current);
        }
    }

    public render() {
        return <span style={this.props.style} ref={this.ref}></span>;
    }
}

interface IReactProps {
    component: IComponentReactViewable;
}

/**
 * Embeds a Fluid Component that supports IComponentReactViewable
 */
const ReactEmbeddedComponent = (props: IReactProps) => props.component.createJSXElement();
