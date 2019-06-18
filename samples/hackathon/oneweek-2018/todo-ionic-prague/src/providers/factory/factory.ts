/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage } from '@ionic/storage';
import { Injectable } from '@angular/core';
import { getRandomName } from "./names";

@Injectable()
export class Factory {
 
  constructor(public storage: Storage){
 
  }

  public getOrCreateList() {
    return new Promise<string>((resolve, reject) => {
      this.storage.get('todolist').then((name: string) => {
        if (name) {
          resolve(name);
        } else {
          const newName = getRandomName("-", false);
          this.storage.set('todolist', newName).then(() => {
            resolve(newName);
          }, (err) => {
            reject(err);
          });  
        }
      }, (error) => {
        reject(error);
      });
    }) 
  }

  public deleteList() {
    return this.storage.clear();
  }
 
}
