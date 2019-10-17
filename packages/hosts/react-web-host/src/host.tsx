/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenApis, loadFluidComponent, loadIFramedFluidComponent } from "@fluid-example/tiny-web-host";
import * as React from "react";

export { isSpoUrl, loadFluidComponent } from "@fluid-example/tiny-web-host";

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
       loadIFramedFluidComponent(
        this.props.url,
        this.divRef.current,
        this.props.tokenApi,
        this.props.clientId ? this.props.clientId : "",
        this.props.clientSecret ? this.props.clientSecret : "",
        this.props.libraryName ? this.props.libraryName : "tinyWebLoader",
       );
    } else {
      loadFluidComponent(
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
