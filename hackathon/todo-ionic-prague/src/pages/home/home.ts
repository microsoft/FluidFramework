import { Component } from '@angular/core';
import { api as prague } from "@prague/routerlicious";
import { ModalController, NavController } from 'ionic-angular';
import * as jwt from "jsonwebtoken";
import { AddItemPage } from '../add-item/add-item'
import { ItemDetailPage } from '../item-detail/item-detail';
import { Data } from '../../providers/data/data';

const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "confident-turing";
const secret = "24c1ebcf087132e31a7e3c25f56f6626";
 
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
 
  public items = [];
 
  constructor(public navCtrl: NavController, public modalCtrl: ModalController, public dataService: Data) {
 
    this.dataService.getData().then((todos) => {
 
      if(todos){
        this.items = todos;
      }
 
    });

    prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);
    const documentId = "hack-todo-0001";

    const token = this.makeToken(documentId);

    this.loadDocument(documentId, token).then((doc) => {
      console.log(`Doc client id: ${doc.clientId}`);
    }, (err) => {
      console.log(err);
    })
 
  }
 
  ionViewDidLoad(){
 
  }
 
  addItem(){
 
    let addModal = this.modalCtrl.create(AddItemPage);
 
    addModal.onDidDismiss((item) => {
 
          if(item){
            this.saveItem(item);
          }
 
    });
 
    addModal.present();
 
  }
 
  saveItem(item){
    this.items.push(item);
    this.dataService.save(this.items);
  }
 
  viewItem(item){
    this.navCtrl.push(ItemDetailPage, {
      item: item
    });
  }

  private async loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
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
 
}