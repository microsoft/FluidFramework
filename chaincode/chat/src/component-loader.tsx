import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import * as ReactDOM from "react-dom";

interface IProps {
  // TODO: Bring back package component. Right now this needs to get a document that already has a loaded chaincode
  // chaincodePackage: string;
  docId: string;
}

interface IState {}

export class LoaderComponent extends React.Component<IProps, IState> {
  private serverUrl: string;
  private domElement: HTMLDivElement;

  constructor(props) {
    super(props);
    this.domElement = document.createElement("div");

    if (document.location.origin.includes("localhost")) {
        this.serverUrl = "http://localhost:3000";
    } else {
        this.serverUrl = document.location.origin;
    }
  }

  async componentDidMount() {
    const domNode = ReactDOM.findDOMNode(this);
    domNode.appendChild(this.domElement);
    let ds = await DataStore.from(this.serverUrl, "anonymous-coward");

    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.domElement)],
      ["datastore", Promise.resolve(ds)]
    ];

    // TODO: this will work because we don't install new chaincode
    // but sabroner is wrong
    await ds.open(this.props.docId, "sabroner", "any", services);
  }

  render() {
    return <div id="host" />;
  }
}
