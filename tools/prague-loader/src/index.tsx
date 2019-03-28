import { Component } from "react";
import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { createDocumentService } from "@prague/routerlicious-socket-storage";
import { WebLoader } from "@prague/loader-web";
import { ILoaderUrl, ILoaderProps, URLToLoaderProps } from "./url-resolver";

export class Loader extends Component<ILoaderUrl, any> {
  dataStore: DataStore;
  bag: ILoaderProps;
  divRef: React.RefObject<HTMLDivElement>;
  constructor(props: ILoaderUrl) {
    super(props);
    this.bag = URLToLoaderProps(this.props.url);
    this.divRef = React.createRef();

    this.dataStore = new DataStore(
      this.bag.ordererUrl,
      this.bag.storageUrl,
      new WebLoader(this.bag.registryUrl),
      createDocumentService(this.bag.ordererUrl, this.bag.storageUrl),
      this.bag.token,
      this.bag.tenant,
      "anonymous-coward"
    );
  }

  async componentDidMount() {
    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.divRef.current)],
      ["datastore", Promise.resolve(this.dataStore)]
    ];

    this.dataStore.open(this.bag.containerId, this.bag.chaincode, this.bag.path, services);
  }

  render() {
    if (!this.dataStore) {
      return (
        <>
          <p>Error: Data Store Not Found</p>
        </>
      );
    }
    return (
      <div>
        <p>Rendering Container {this.bag.containerId} </p>
        <div ref={this.divRef}/>
      </div>
    );
  }
}
