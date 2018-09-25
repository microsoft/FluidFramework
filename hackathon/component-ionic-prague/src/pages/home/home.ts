import { Component } from '@angular/core';
import { ModalController, NavController } from 'ionic-angular';
import { AddItemPage } from '../add-item/add-item'
 
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

  loadChainCode(id: string) {
    const host = document.getElementById("host");
    host.innerHTML = `<span>This is ${id} </span>`;
  }
}