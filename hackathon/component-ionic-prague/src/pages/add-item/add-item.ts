import { Component } from '@angular/core';
import { NavController, ViewController } from 'ionic-angular';
 
@Component({
  selector: 'page-add-item',
  templateUrl: 'add-item.html'
})
export class AddItemPage {
 
  documentId: string;

  constructor(public navCtrl: NavController, public view: ViewController) {
 
  }
 
  saveItem(){
    let newItem = {
      id: this.documentId ? this.documentId : ""
    };
    this.view.dismiss(newItem);
  }
 
  close(){
    this.view.dismiss();
  }
 
}