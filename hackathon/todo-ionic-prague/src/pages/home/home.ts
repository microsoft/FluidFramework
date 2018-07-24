import { Component } from '@angular/core';
import { ModalController, NavController } from 'ionic-angular';
import { AddItemPage } from '../add-item/add-item'
import { ItemDetailPage } from '../item-detail/item-detail';
import { Data } from '../../providers/data/data';
import { Factory } from '../../providers/factory/factory';
 
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
 
  public items = [];
 
  constructor(
    public navCtrl: NavController,
    public modalCtrl: ModalController,
    public dataService: Data,
    public factoryService: Factory) {
  }
 
  ionViewDidLoad(){
    
    this.factoryService.getOrCreateList().then((documentId) => {
      console.log(`Name ${documentId} generated!`);
      this.dataService.init(documentId).then(() => {
        console.log(`Created a document and started listening!`);
      }, (err) => {
        console.log(`Error creating document: ${err}`);
      });
    }, (error) => {
      console.log(`Error generating document name: ${error}`);
    });
  }
 
  addItem(){
    let addModal = this.modalCtrl.create(AddItemPage);
    addModal.onDidDismiss((item) => {
      if(item){
        this.dataService.save(item);
      }
    });
    addModal.present();
  }
 
  viewItem(item){
    this.navCtrl.push(ItemDetailPage, {
      item: item
    });
  }
 
}