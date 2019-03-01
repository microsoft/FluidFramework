import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import * as ReactDOM from "react-dom";

export interface IOutieProps {
  // TODO: Bring back package component. Right now this needs to get a document that already has a loaded chaincode
  chaincodePackage: string;
  componentId: string;
  serverUrl: string;
}

interface IState {}

export class LoaderComponent extends React.Component<IOutieProps, IState> {
  private domElement: HTMLDivElement;

  constructor(props) {
    super(props);
    console.log("Constructor");

    this.domElement = document.createElement("div");
  }

  async componentDidMount() {
    console.log("Component Did Mount");
    const domNode = ReactDOM.findDOMNode(this);
    domNode.appendChild(this.domElement);

    let ds = await DataStore.from(this.props.serverUrl, "anonymous-coward");

    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.domElement)],
      ["datastore", Promise.resolve(ds)]
    ];

    // TODO: this will work because we don't install new chaincode
    // but sabroner is wrong
    await ds.open(this.props.componentId, this.props.chaincodePackage, "", services);
  }

  render() {
    console.log("Render");

    return <div id="host" />;
  }
}


export async function componentDidMount() {

  this.docId = await this.props.root.get("docId");

  let ds = await DataStore.from(await this.props.root.get("serverUrl"), "anonymous-coward");
  const div = document.createElement("div");

  const services: ReadonlyArray<[string, Promise<any>]>  = [
      ["div", Promise.resolve(div)], 
      ["datastore", Promise.resolve(ds)]
  ];

  this.props.div.appendChild(div);
  await ds.open(this.docId, await this.props.root.get("chaincodePackage"), "", services);
}