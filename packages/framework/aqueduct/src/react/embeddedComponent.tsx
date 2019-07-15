/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLVisual  } from "@prague/container-definitions";
import * as React from "react";
import { IComponentReactViewable } from "./interfaces";

/**
 * Creates a new Embedded Component while allowing you to register the getComponent call upfront.
 */
export class EmbeddedReactComponentFactory {
    constructor(private readonly getComponent: (id: string) => Promise<IComponent>) { }

    public create(id: string): JSX.Element {
        return <EmbeddedComponent getComponent={this.getComponent} id={id} />;
    }
}

interface IProps {
    id: string;
    getComponent(id: string): Promise<IComponent>;
}

interface IState {
    element: JSX.Element;
}

/**
 * Given a way to get a component will render that component via react if the component supports IComponentReactViewable
 * or standard HTML if the component supports IComponentHTMLVisual
 *
 * If the component doesn't exist or supports neither interfaces we render and empty <span/>
 */
export class EmbeddedComponent extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            element: <span/>,
        };
    }

    public async componentWillMount() {
        const component = await this.props.getComponent(this.props.id);
        if (!component) {
            return;
        }

        // Query to see if the component supports IComponentReactViewable
        const reactViewable = component.query<IComponentReactViewable>("IComponentReactViewable");
        if (reactViewable) {
            this.setState({ element: <ReactEmbeddedComponent component={reactViewable}/>});
            return;
        }

        const htmlVisual = component.query<IComponentHTMLVisual>("IComponentHTMLVisual");
        if (htmlVisual) {
            this.setState({ element: <HTMLEmbeddedComponent component={htmlVisual} />});
            return;
        }
    }

    public render() {
        return this.state.element;
    }
}

interface IHTMLProps {
    component: IComponentHTMLVisual;
}

/**
 * Embeds a Fluid Component that supports IComponentHTMLVisual
 */
class HTMLEmbeddedComponent extends React.Component<IHTMLProps, { }> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: IHTMLProps) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    public async componentDidMount() {
        if (this.ref.current) {
            this.props.component.render(this.ref.current);
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
function ReactEmbeddedComponent(props: IReactProps) {
    return props.component.createJSXElement();
}
