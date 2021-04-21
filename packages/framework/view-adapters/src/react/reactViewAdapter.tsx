/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";

export interface IReactViewAdapterProps {
    /**
     * The view to adapt into a React component.
     */
    view: IFluidObject;
}

/**
 * Abstracts rendering of views as a React component.  Supports React elements, as well as
 * views that implement IFluidHTMLView.
 *
 * If the object is none of these, we render nothing.
 */
export class ReactViewAdapter extends React.Component<IReactViewAdapterProps> {
    /**
     * Test whether the given Fluid object can be successfully adapted by a ReactViewAdapter.
     * @param view - the fluid object to test if it is adaptable.
     */
    public static canAdapt(view: IFluidObject) {
        return (
            React.isValidElement(view)
            || view.IFluidHTMLView !== undefined
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

        const htmlView = this.props.view.IFluidHTMLView ?? this.props.view.IFluidHTMLView;
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
    htmlView: IFluidHTMLView;
}

/**
 * Embeds a Fluid Object that supports IFluidHTMLView
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
