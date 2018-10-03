import { Component } from '@angular/core';
import { NavController, ViewController } from 'ionic-angular';
 
@Component({
  selector: 'page-add-item',
  templateUrl: 'add-item.html'
})
export class AddItemPage {
 
  documentId: string;
  flowView: boolean;

  constructor(public navCtrl: NavController, public view: ViewController) {
 
  }
 
  saveItem(){
    let newItem = {
      id: this.documentId ? this.documentId : "",
      flowView: this.flowView
    };
    this.view.dismiss(newItem);
  }
 
  close(){
    this.view.dismiss();
  }
 
}