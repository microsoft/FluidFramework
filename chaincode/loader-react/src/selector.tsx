import * as React from "react";
import { ISharedMap } from "@prague/map";
import { ComponentHost } from "@prague/component";

interface IProps {
  root: ISharedMap;
  host: ComponentHost;
}

interface IState {
  docId: string;
  serverUrl: string;
  chaincodePackage: string;
  shouldRender: boolean;
}

export class Selector extends React.Component<IProps, IState> {
  constructor(props) {
    super(props);

    const docIdP = this.props.root.wait<string>("docId");
    const serverUrlP = this.props.root.wait<string>("serverUrl");
    const chaincodePackageP = this.props.root.wait<string>("chaincodePackage");
    const shouldRenderP = this.props.root.wait<boolean>("shouldRender");

    Promise.all([docIdP, serverUrlP, chaincodePackageP, shouldRenderP]).then(
      ([docId, serverUrl, chaincodePackage, shouldRender]) => {
        this.setState({
          docId: docId,
          serverUrl: serverUrl,
          chaincodePackage: chaincodePackage,
          shouldRender: shouldRender
        });
      }
    );

    this.props.root.on("valueChanged", async changed => {
      const state = this.state;
      state[changed.key] = await this.props.root.get(changed.key);
      this.setState(state);
    });
  }

  async componentDidMount() {
    console.log("Component Did Mount");
  }

  handleTextChange(
    key: string
  ): (event: React.ChangeEvent<HTMLInputElement>) => void {
    return (ev: React.ChangeEvent<HTMLInputElement>) => {
      this.props.root.set(key, ev.target.value);
    };
  }

  handleRender = async () =>  {
    const { chaincodePackage, docId } = this.state;

    await this.props.host.createAndAttachComponent(docId, chaincodePackage);

    await this.props.root.set("shouldRender", true)
  }

  render() {
    if (this.state === null) {
      return <p> Selector </p>;
    }
    const { chaincodePackage, docId, serverUrl, shouldRender } = this.state;
    // const todo = document.createElement("div");
    if (shouldRender) {
      // TODO: if it's an innie

      return (
        <div>
        {this.props.children}

        </div>
      );
    }

    return (
      <>
        <p> Chaincode Selector </p>
        <div>
          <span>
            <a>Doc Id</a>
            <input
              type={"text"}
              disabled={shouldRender}
              value={docId}
              onChange={this.handleTextChange("docId")}
            />
          </span>
        </div>
        <div>
          <span>
            <a>Server Url</a>
            <input
              type={"text"}
              disabled={shouldRender}
              value={serverUrl}
              onChange={this.handleTextChange("serverUrl")}
            />
          </span>
        </div>
        <div>
          <span>
            <a>Chaincode Package</a>
            <input
              type={"text"}
              disabled={shouldRender}
              value={chaincodePackage}
              onChange={this.handleTextChange("chaincodePackage")}
            />
          </span>
        </div>
        <div>
          <span>
            <input
              type={"button"}
              disabled={shouldRender}
              value={"Render"}
              onClick={this.handleRender}
            />
          </span>
        </div>
      </>
    );
  }
}
