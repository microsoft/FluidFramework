import { IChaincode } from "@prague/runtime-definitions";
import { DataStore } from "@prague/datastore";
import { ChatApp } from "./chat-app";

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
  return DataStore.instantiate(new ChatApp());
}
