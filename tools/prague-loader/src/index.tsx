import { Component } from "react";
import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { createDocumentService } from "@prague/routerlicious-socket-storage";
import { WebLoader } from "@prague/loader-web";
import * as UrlParse from "url-parse";

export interface ILoaderProps {
  containerId: string; // ID of the container
  ordererUrl: string; // "Alfred" "localhost:3000" "alfred.wu2..."
  storageUrl: string; // "Historian" "localhost:3003" "historian.wu2..."
  // (registryUrl is a different endpoint than verdaccio)
  registryUrl: string; // "Auspkn" "localhost:3002" https://pragueauspkn-3873244262.azureedge.net"
}

export interface ILoaderUrl {
  url: string;
}

export function URLToLoaderProps(
  urlString: string
): ILoaderProps {
  const url = UrlParse(urlString);
  const pathParts = url.pathname.split("/");
  const container = pathParts[3];
  const propsWithoutDiv = {
    containerId: container,
    ordererUrl: "https://" + url.host.replace("www", "alfred"),
    storageUrl: "https://" + url.host.replace("www", "historian"),
    registryUrl: "https://pragueauspkn-3873244262.azureedge.net"
  };
  return propsWithoutDiv;
}

export class Loader extends Component<ILoaderUrl, any> {
  dataStore: DataStore;
  bag: ILoaderProps;
  divRef: React.RefObject<HTMLDivElement>;
  constructor(props: ILoaderUrl) {
    super(props);
    this.bag = URLToLoaderProps(this.props.url);
    this.divRef = React.createRef();
    const tenantSecret = "4a9211594f7c3daebca3deb8d6115fe2";
    const tenantId = "stupefied-kilby";

    this.dataStore = new DataStore(
      this.bag.ordererUrl,
      this.bag.storageUrl,
      new WebLoader(this.bag.registryUrl),
      createDocumentService(this.bag.ordererUrl, this.bag.storageUrl),
      tenantSecret,
      tenantId,
      "anonymous-coward"
    );
  }

  async componentDidMount() {
    const services: ReadonlyArray<[string, Promise<any>]> = [
      ["div", Promise.resolve(this.divRef.current)],
      ["datastore", Promise.resolve(this.dataStore)]
    ];

    this.dataStore.open(this.bag.containerId, "", "", services);
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
