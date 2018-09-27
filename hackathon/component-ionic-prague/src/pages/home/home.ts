import { Component } from '@angular/core';
import * as loader from "@prague/loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import * as socketStorage from "@prague/socket-storage"
import { ModalController, NavController } from 'ionic-angular';
import * as jwt from "jsonwebtoken";
import { AddItemPage } from '../add-item/add-item';

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "happy-chatterjee";
const secret = "8f69768d16e3852bc4b938cdaa0577d1";

const chainRepo = "https://packages.wu2.prague.office-int.com";
 
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
 
  public items = [];
  public documentId: string;
 
  constructor(
    public navCtrl: NavController,
    public modalCtrl: ModalController,) {
  }
 
  ionViewDidLoad(){
    console.log(`Just loaded the view!`);
  }
 
  addItem(){
    let addModal = this.modalCtrl.create(AddItemPage);
    addModal.onDidDismiss((item) => {
      if(item){
        console.log(`Document to add ${JSON.stringify(item)}`);
        this.loadChainCode(item.id);
      }
    });
    addModal.present();
  }

  loadChainCode(documentId: string) {    
    const host = document.getElementById("host");
    host.innerHTML = "";
    const docDiv = document.createElement("div");
    host.appendChild(docDiv);

    this.loadDocument(documentId.toLowerCase(), docDiv)
  }

  private async loadDocument(documentId: string, div: HTMLDivElement) {
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

    const webLoader = new WebLoader(chainRepo);
    const webPlatform = new WebPlatform(div);

    const documentServices = socketStorage.createDocumentService(routerlicious, historian);
    const tokenService = new socketStorage.TokenService();

    await loader.load(
      token,
      null,
      webPlatform,
      documentServices,
      webLoader,
      tokenService,
      null,
      true);

    console.log(`Done loading the doc!`);
  }
}