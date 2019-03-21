import React, { Component } from "react";
import { DataStore } from "@prague/app-datastore";
import {
  createDocumentService,
} from "@prague/routerlicious-socket-storage";
import { WebLoader } from "@prague/loader-web";

export interface IContainerLoaderProps {
  containerId: string; // ID of the container
  ordererUrl: string; // "Alfred" "localhost:3000" "alfred.wu2..."
  storageUrl: string; // "Historian" "localhost:3003" "historian.wu2..."
  // (registryUrl is a different endpoint than verdaccio)
  registryUrl: string; // "Auspkn" "localhost:3002" https://pragueauspkn-3873244262.azureedge.net"
  div: HTMLDivElement; // Div from render
}

class App extends Component<IContainerLoaderProps, any> {
  dataStore: DataStore;
  constructor(props: IContainerLoaderProps) {
    super(props);

    // TODO: Create your own loader
    const tenantSecret = "4a9211594f7c3daebca3deb8d6115fe2";
    const tenantId = "stupefied-kilby";

    this.dataStore = new DataStore(
      props.ordererUrl,
      props.storageUrl,
      new WebLoader(props.registryUrl),
      createDocumentService(props.ordererUrl, props.storageUrl),
      tenantSecret,
      tenantId,
      "anonymous-coward"
    );
  }

  async componentDidMount() {
    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.props.div)],
      ["datastore", Promise.resolve(this.dataStore)]
    ];

    this.dataStore.open(this.props.containerId, "", "", services);
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
      <>
        <p>Rendering Container {this.props.containerId} </p>
      </>
    );
  }
}

export default App;
