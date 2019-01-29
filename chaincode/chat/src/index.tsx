import { IChaincode } from "@prague/runtime-definitions";
import { Component } from "@prague/app-component";
import { ChatApp } from "./chat-app";

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
  return Component.instantiate(new ChatApp());
}
