/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLViewable  } from "@prague/container-definitions";
import * as React from "react";
import { IComponentReactViewable } from "./interfaces";

interface pEmbed {
    getComponent(id: string): Promise<IComponent>;
    id: string;
}

interface sEmbed {
    element: JSX.Element;
}

class FluidEmbeddedComponent extends React.Component<pEmbed, sEmbed> {
    constructor(props: pEmbed) {
        super(props);

        this.state = {
            element: <span></span>,
        };
    }

    async componentWillMount() {
        const component = await this.props.getComponent(this.props.id);
        const reactViewable = component.query<IComponentReactViewable>("IComponentReactViewable");
        if (reactViewable) {
            this.setState({ element: <FluidReactEmbeddedComponent component={reactViewable}/>});
            return;
        }

        const htmlViewable = component.query<IComponentHTMLViewable>("IComponentHTMLViewable");
        if (htmlViewable) {
            this.setState({ element: <FluidHTMLEmbeddedComponent component={htmlViewable} />});
            return;
        }
    }

    render() {
        return this.state.element;
    }
}

interface pHTML {
    component: IComponentHTMLViewable;
}

class FluidHTMLEmbeddedComponent extends React.Component<pHTML, { }> {
    private readonly ref: React.RefObject<HTMLDivElement>;

    constructor(props: pHTML) {
        super(props);

        this.ref = React.createRef<HTMLDivElement>();
    }

    async componentDidMount() {
        await this.props.component.addView(undefined, this.ref.current);
    }

    render() {
        return <div ref={this.ref}></div>;
    }
}

interface pReact {
    component: IComponentReactViewable;
}

// tslint:disable-next-line:function-name
function FluidReactEmbeddedComponent(props: pReact) {
    return (props.component.createViewElement());
}

export class EmbeddedReactComponentFactory {
    constructor(private readonly getComponent: (id: string) => Promise<IComponent>) { }

    public create(id: string): JSX.Element {
        return <FluidEmbeddedComponent getComponent={this.getComponent} id={id} />;
    }
}
