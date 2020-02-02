/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import { IComponentReactViewable } from "./interfaces";

export interface IEmbeddedComponentProps {
    component: IComponent;
    style?: React.CSSProperties;
}

/**
 * Will render a component via react if the component supports IComponentReactViewable
 * or standard HTML if the component supports IComponentHTMLVisual
 *
 * If the component supports neither interface we render an empty <span />
 */
export class EmbeddedComponent extends React.Component<IEmbeddedComponentProps> {
    private readonly element: JSX.Element;

    constructor(props: IEmbeddedComponentProps) {
        super(props);

        const reactViewable = this.props.component.IComponentReactViewable;
        if (reactViewable) {
            this.element = <ReactEmbeddedComponent component={reactViewable}/>;
            return;
        }

        const htmlVisual = this.props.component.IComponentHTMLVisual;
        if (htmlVisual) {
            this.element = <HTMLEmbeddedComponent component={htmlVisual} />;
            return;
        }

        this.element = <span />;
    }

    public render() {
        return this.element;
    }
}

interface IHTMLProps {
    component: IComponentHTMLVisual;
    style?: React.CSSProperties;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
class HTMLEmbeddedComponent extends React.Component<IHTMLProps, { }> {
    private readonly ref: React.RefObject<HTMLSpanElement>;

    constructor(props: IHTMLProps) {
        super(props);

        this.ref = React.createRef<HTMLSpanElement>();
    }

    public async componentDidMount() {
        if (this.ref.current) {
            if (this.props.component.addView) {
                const view = this.props.component.addView();
                view.render(this.ref.current);
            } else {
                this.props.component.render(this.ref.current);
            }
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
