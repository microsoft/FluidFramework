import { Component } from "react";
import * as React from "react";
import { LoadPragueComponent } from "@prague/vanilla-loader";

interface ILoaderUrl {
  url: string;
  appId: string;
  getToken: () => Promise<string>;
}

export class PragueLoader extends Component<ILoaderUrl, any> {
  divRef: React.RefObject<HTMLDivElement>;
  constructor(props: ILoaderUrl) {
    super(props);
    this.divRef = React.createRef();
  }

  async componentDidMount() {
    LoadPragueComponent(this.props.url, this.props.getToken, this.divRef.current, this.props.appId);
  }

  render() {
    return (
      <div>
        <div ref={this.divRef} />
      </div>
    );
  }
}
