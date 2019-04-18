import { Document } from "@prague/app-component";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { getRandomName } from "./names";
import { ISharedMap } from "@prague/map";
import { Selector } from "./selector";
import { InnieLoader } from "./innie-loader";
import { OutieLoader } from "./outie-loader";

export class LoaderChaincode extends Document {
  // Initialize the document/component (only called when document is initially created).
  protected async create() {
    let serverUrl: string;
    if (document.location.origin.includes("localhost")) {
      serverUrl = "https://alfred.wu2-ppe.prague.office-int.com";
    } else {
      serverUrl = document.location.origin;
    }

    const A = this.createMap();
    const B = this.createMap();
    const C = this.createMap();
    const D = this.createMap();

    A.set<string>("docId", getRandomName());
    A.set<string>("serverUrl", serverUrl);
    A.set<string>("chaincodePackage", "@chaincode/counter");
    A.set<string>("shouldRender", "");

    B.set<string>("docId", getRandomName());
    B.set<string>("serverUrl", serverUrl);
    B.set<string>("chaincodePackage", "@chaincode/counter");
    B.set<string>("shouldRender", "");

    C.set<string>("docId", getRandomName());
    C.set<string>("serverUrl", serverUrl);
    C.set<string>("chaincodePackage", "@chaincode/counter");
    C.set<string>("shouldRender", "");

    D.set<string>("docId", getRandomName());
    D.set<string>("serverUrl", serverUrl);
    D.set<string>("chaincodePackage", "@chaincode/counter@0.0.5264");
    D.set<string>("shouldRender", "");

    this.root.set<ISharedMap>("A", A);
    this.root.set<ISharedMap>("B", B);
    this.root.set<ISharedMap>("C", C);
    this.root.set<ISharedMap>("D", D);
  }

  styleMainDiv(div: HTMLDivElement): HTMLDivElement {
    const height = document.documentElement.clientHeight - 50;
    const width = document.documentElement.clientWidth - 50;

    div.style.width = (width * 11) / 23 + "px";
    div.style.height = height / 2 + "px";
    div.style.margin = "5px";
    div.style.border = "solid black 4px";

    return div;
  }

  // Once document/component is opened, finish any remaining initialization required before the
  // document/component is returned to to the host.
  public async opened() {
    // If the host provided a <div>, display a minimual UI.
    const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
    if (maybeDiv) {
      const divA = this.styleMainDiv(document.createElement("div"));
      divA.style.cssFloat = "left";
      const divB = this.styleMainDiv(document.createElement("div"));
      divB.style.cssFloat = "right";
      const divC = this.styleMainDiv(document.createElement("div"));
      divC.style.cssFloat = "left";
      const divD = this.styleMainDiv(document.createElement("div"));
      divD.style.cssFloat = "right";
      maybeDiv.append(divA);
      maybeDiv.append(divB);
      maybeDiv.append(divC);
      maybeDiv.append(divD);

      ReactDOM.render(
        <Selector
          root={await this.root.wait<ISharedMap>("A")}
          host={this.host}
          innie={
            <InnieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("A")}
              div={divA}
            />
          }
          outie={
            <OutieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("A")}
              div={divA}
            />
          }
        />,
        divA
      );
      ReactDOM.render(
        <Selector
          root={await this.root.wait<ISharedMap>("B")}
          host={this.host}
          innie={
            <InnieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("B")}
              div={divB}
            />
          }
          outie={
            <OutieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("B")}
              div={divB}
            />
          }
        />,
        divB
      );
      ReactDOM.render(
        <Selector
          root={await this.root.wait<ISharedMap>("C")}
          host={this.host}
          innie={
            <InnieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("C")}
              div={divC}
            />
          }
          outie={
            <OutieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("C")}
              div={divC}
            />
          }
        />,
        divC
      );
      ReactDOM.render(
        <Selector
          root={await this.root.wait<ISharedMap>("D")}
          host={this.host}
          innie={
            <InnieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("D")}
              div={divD}
            />
          }
          outie={
            <OutieLoader
              host={this.host}
              root={await this.root.wait<ISharedMap>("D")}
              div={divD}
            />
          }
        />,
        divD
      );
    }
  }
}
