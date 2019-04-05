// tslint:disable:no-console
import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ExtendedDocument as Document } from "./extendedDocument";
import { OwnedSharedMap } from "./ownedMap";

export class OwnedMap extends Document {
  public ownedMap: OwnedSharedMap;
  public counter: Counter;

  /**
   *  The component has been loaded. Render the component into the provided div
   **/
  public async opened() {
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      this.counter = await this.root.wait<Counter>("clicks");
      this.ownedMap = await this.root.wait<OwnedSharedMap>("ownedMap");

      const render = () => this.render(maybeDiv);

      this.root.on("op", () => {
        render();
      });

      this.ownedMap.on("op", () => {
        render();
      });

      this.render(maybeDiv);

    } else {
      return;
    }
  }
  /**
   * Create the component's schema and perform other initialization tasks
   * (only called when document is initially created).
   */
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);

    this.root.set("ownedMap", this.createOwnedMap());
    this.ownedMap = this.root.get("ownedMap");
    this.ownedMap.set("title", "Default Title");
  }

  protected render(host: HTMLDivElement) {

    let title = "Not Defined Yet!";
    let amOwner = false;
    let change = (e) => alert("Map Not defined");

    if (this.ownedMap) {
      amOwner = this.ownedMap.isOwner(this.runtime.clientId);
      change = (e) => this.ownedMap.set("title", e.target.value);
      title = this.ownedMap.get("title");

      if (amOwner) {
        console.log("I am owner");
      } else {
        console.log(" Non Owner");
      }

    }

    ReactDOM.render(
      <div>
          {this.ownedMap ?
          <div>
            <p>Owned Map exists</p>
            {amOwner ? <p> I am owner </p> : <p>Non Owner</p>}
          </div>
          : <p>No Owned Map</p>}
          <p>{title}</p>
          <input type={"text"} onChange={change} />
          <br />
          <br />

        <span>{this.counter.value}</span>
        <button onClick={() => this.counter.increment(1)}>+</button>
      </div>,
      host,
    );
  }
}

export async function instantiateRuntime(
  context: IContainerContext,
): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", Promise.resolve(OwnedMap)],
  ]);
}
