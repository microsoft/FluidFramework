/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import { IComponentReactViewable } from "./interfaces";

export interface IEmbeddedComponentProps {
    component: IComponent;
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
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class HTMLEmbeddedComponent extends React.Component<IHTMLProps, { }> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
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
        return <div ref={this.ref}></div>;
    }
}

interface IReactProps {
    component: IComponentReactViewable;
}

/**
 * Embeds a Fluid Component that supports IComponentReactViewable
 */
// tslint:disable-next-line:function-name
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReactEmbeddedComponent(props: IReactProps) {
    return props.component.createJSXElement();
}
