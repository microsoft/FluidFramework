import { api as prague } from "@prague/routerlicious";
import { Storage } from '@ionic/storage';
import { Injectable } from '@angular/core';
import * as jwt from "jsonwebtoken";
 
const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "confident-turing";
const secret = "24c1ebcf087132e31a7e3c25f56f6626";

export interface IItem {
  id: string;
  title: string;
  description: string;
}

@Injectable()
export class Data {

  private document: prague.api.Document;
  private todoView: prague.types.IMapView;
  private todoMap: prague.types.IMap;

  public list: IItem[] = [];
 
  constructor(public storage: Storage){
    prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);
  }

  public init(documentId: string) {
    const token = this.makeToken(documentId);
    return new Promise<void>((resolve, reject) => {
      this.loadDocument(documentId, token).then((doc) => {
        this.document = doc;
        this.prepare().then(() => {
          this.getData();
          this.setListener();
          resolve();
        }, (err) => {
          reject(err);
        });
      }, (err) => {
        reject(err);
      })
    });
  }
 
  public save(data: IItem){
    const keyArray = Array.from(this.todoView.keys());
    const mapIndex = keyArray.length;
    this.todoView.set(String(mapIndex), `${data.title}@${data.description}`);
  }

  public delete(id: string) {
    this.todoView.set(id, undefined);
    console.log(`Deleted: $(id)`);
  }

  private setListener() {
    this.todoMap.on("valueChanged", () => {
      this.getData();
    })
  }

  private getData() {
    const keyArray = Array.from(this.todoView.keys());
    const items = keyArray.map((key) => {
        const rawItem = this.todoView.get(key) as string;
        if (!rawItem || rawItem === "") {
            return undefined;
        } else {
            const parts = rawItem.split("@");
            return {
              description: parts[1],
              id: key,
              title: parts[0],
            };
        }
    });
    this.list = items.filter((item) => item && item.title && item.title !== "");
}

  private async prepare() {
    return new Promise<void>((resolve, reject) => {
      if (this.document.existing) {
        console.log(`Existing document!`);
        const rootMap = this.document.getRoot();
        // Wait for the root map to show up.
        rootMap.wait("todo").then(() => {
          this.prepareCore().then(() => {
            resolve();
          }, (error) => {
            reject(error);
          });
        });
      } else {
        this.prepareCore(true).then(() => {
          resolve();
        }, (error) => {
          reject(error);
        });
      }
    });
  }
  private async prepareCore(create?: boolean) {
    const rootMap = this.document.getRoot();
    if (create) {
      rootMap.set("todo", this.document.createMap()); 
    }
    this.todoMap = await rootMap.get("todo") as prague.types.IMap;
    this.todoView = await this.todoMap.getView();
  }

  private makeToken(documentId: string) {
    const token = jwt.sign(
      {
          documentId,
          permission: "read:write", // use "read:write" for now
          tenantId,
          user: {
              id: "test",
          },
      },
      secret);
      return token;
  }

  private async loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
  }
 
}