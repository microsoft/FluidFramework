import { Component } from "@prague/app-component";
import { LoaderChaincode } from "./loader-app";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
// import * as counter from "@chaincode/counter";

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, "@chaincode/loader", [
      ["@chaincode/loader", LoaderChaincode]
    //   ["@chaincode/counter", counter ]
    ]);
  }
  