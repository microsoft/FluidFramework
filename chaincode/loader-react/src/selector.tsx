import * as React from "react";
import { ISharedMap } from "@prague/map";
import { ComponentHost } from "@prague/component";
import { innie, outie } from "./constants";

interface IProps {
  root: ISharedMap;
  host: ComponentHost;
  innie: React.ReactNode;
  outie: React.ReactNode;
}

interface IState {
  docId: string;
  serverUrl: string;
  chaincodePackage: string;
  shouldRender: string;
}

export class Selector extends React.Component<IProps, IState> {
  outieA: boolean;

  constructor(props) {
    super(props);

    const docIdP = this.props.root.wait<string>("docId");
    const serverUrlP = this.props.root.wait<string>("serverUrl");
    const chaincodePackageP = this.props.root.wait<string>("chaincodePackage");
    const shouldRenderP = this.props.root.wait<string>("shouldRender");

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

  renderInnie = async () => {
    const { chaincodePackage, docId } = this.state;

    await this.props.host.createAndAttachComponent(docId, chaincodePackage);

    await this.props.root.set("shouldRender", innie);
  }

  renderOutie = async () => {
    const { chaincodePackage, docId, serverUrl } = this.state;
    console.log(chaincodePackage);
    console.log(docId);
    console.log(serverUrl);

    // TODO: this is related to the component loading hack
    this.outieA = true;
    this.setState(
      this.state
    );
  };

  render() {
    if (this.state === null) {
      return <p> Selector </p>;
    }
    const { chaincodePackage, docId, serverUrl, shouldRender } = this.state;

    const rendered = (shouldRender !== "");
    console.log("Render");
    console.log(this.outieA);
    if (shouldRender === innie) {
      return <div>{this.props.innie}</div>;

    } else if (this.outieA === true || shouldRender === outie) { // TODO This is a hack... because we need to delay render the outie
      return <div>{this.props.outie}</div>;
    }

    return (
      <>
        <p> Chaincode Selector </p>
        <div>
          <span>
            <a>Doc Id</a>
            <input
              type={"text"}
              disabled={rendered}
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
              disabled={rendered}
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
              disabled={rendered}
              value={chaincodePackage}
              onChange={this.handleTextChange("chaincodePackage")}
            />
          </span>
        </div>
        <div>
          <span>
            <input
              type={"button"}
              disabled={rendered}
              value={"Render Innie"}
              onClick={this.renderInnie}
            />
            <input
              type={"button"}
              disabled={rendered}
              value={"Render Outie"}
              onClick={this.renderOutie}
            />
          </span>
        </div>
      </>
    );
  }
}
