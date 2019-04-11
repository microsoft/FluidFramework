import { Component } from "react";
import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { WebLoader } from "@prague/loader-web";
import { ILoaderUrl, ILoaderProps, URLToLoaderProps } from "./url-parser";
import { loadSharepointPragueComponent } from '@ms/office-prague-container';

export class Loader extends Component<ILoaderUrl, any> {
  dataStore: DataStore;
  routerliciousBag: ILoaderProps;
  divRef: React.RefObject<HTMLDivElement>;
  constructor(props: ILoaderUrl) {
    super(props);
    this.divRef = React.createRef();

    if (props.url.includes("weuprodprv")) {
      console.log("SPO");
    } else {
      console.log("Routerlicious");

      this.routerliciousBag = URLToLoaderProps(this.props.url);

      this.dataStore = new DataStore(
        this.routerliciousBag.ordererUrl,
        this.routerliciousBag.storageUrl,
        new WebLoader(this.routerliciousBag.registryUrl),
        new RouterliciousDocumentServiceFactory(),
        this.routerliciousBag.token,
        this.routerliciousBag.tenant,
        "anonymous-coward"
      );
    }
  }

  async componentDidMount() {
    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.divRef.current)],
      ["datastore", Promise.resolve(this.dataStore)]
    ];

    if (!this.routerliciousBag) {
      loadSharepointPragueComponent(this.props.url, this.props.token, this.divRef.current); 

    } else {
      this.dataStore.open(
        this.routerliciousBag.containerId,
        this.routerliciousBag.chaincode,
        this.routerliciousBag.path,
        services
      );
    }
  }

  render() {
    return (
      <div>
        <div ref={this.divRef} />
      </div>
    );
  }
}
