import { Component } from "react";
import * as React from "react";
import { ILoaderUrl } from "./url-parser";
import { LoadPragueComponent } from "@prague/vanilla-loader";

export class Loader extends Component<ILoaderUrl, any> {
  divRef: React.RefObject<HTMLDivElement>;
  constructor(props: ILoaderUrl) {
    super(props);
    this.divRef = React.createRef();
  }

  async componentDidMount() {
    LoadPragueComponent(this.props.url, this.props.token, this.divRef.current);
  }

  render() {
    return (
      <div>
        <div ref={this.divRef} />
      </div>
    );
  }
}
