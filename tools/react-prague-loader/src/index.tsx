import { Component } from "react";
import * as React from "react";
import { LoadPragueComponent } from "@prague/vanilla-loader";

export { isPragueURL } from "@prague/vanilla-loader";

interface ILoaderProps {
  /**
   * URL of the Prague component
   */
  url: string;

  /**
   * The SPO AppId. If no SPO AppId available, a consistent and descriptive app name is acceptable
   */
  appId: string;

  /**
   * Function that either returns an SPO token, or a Routerlicious tenant token
   */
  getToken: () => Promise<string>;
}

export class PragueLoader extends Component<ILoaderProps, any> {
  divRef: React.RefObject<HTMLDivElement>;

  constructor(props: ILoaderProps) {
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
