/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenApis,  loadFluidContainer, loadIFramedFluidContainer } from "@fluid-example/tiny-web-host";
import * as React from "react";

export interface ILoaderProps {

    clientId?: string;

    clientSecret?: string;

    iframe?: boolean;

    libraryName?: string;

    /**
     * URL of the Fluid component
     */
    url: string;

    /**
     * The SPO AppId. If no SPO AppId available, a consistent and descriptive app name is acceptable
     */
    appId: string;

    /**
     * Function that either returns an SPO token, or a Routerlicious tenant token
     */
    tokenApi: ITokenApis;
}

export class FluidLoader extends React.Component<ILoaderProps, any> {
    private readonly divRef: React.RefObject<HTMLDivElement>;

    constructor(props: ILoaderProps) {
        super(props);
        this.divRef = React.createRef();
    }

    public async componentDidMount() {
        if (this.props.iframe) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            loadIFramedFluidContainer(
                this.props.url,
                this.divRef.current,
                this.props.tokenApi,
                this.props.clientId ? this.props.clientId : "",
                this.props.clientSecret ? this.props.clientSecret : "",
                this.props.libraryName ? this.props.libraryName : "tinyWebLoader",
            );
        } else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            loadFluidContainer(
                this.props.url,
                this.divRef.current,
                this.props.tokenApi,
                this.props.clientId ? this.props.clientId : "",
                this.props.clientSecret ? this.props.clientSecret : "",
            );
        }
    }

    public render() {
        return (
            <div>
                <div ref={this.divRef} />
            </div>
        );
    }
}
