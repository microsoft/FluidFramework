import { Component } from '@angular/core';
import { ModalController, NavController } from 'ionic-angular';
import { AddItemPage } from '../add-item/add-item'
import { ItemDetailPage } from '../item-detail/item-detail';
 
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
        console.log(`Item to add ${JSON.stringify(item)}`);
      }
    });
    addModal.present();
  }

  removeItem(id: string) {
    console.log(``);
  }
 
  viewItem(item){
    this.navCtrl.push(ItemDetailPage, {
      item: item
    });
  }

  doRefresh(refresher) {
    console.log('Begin async operation', refresher);
    refresher.complete();
  }
 
}