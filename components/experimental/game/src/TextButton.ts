/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import phaser from "phaser";

export class TextButton extends phaser.GameObjects.Text {
    constructor(scene, x, y, text, style, callback, endCallback) {
      super(scene, x, y, text, style);

      this.setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.enterButtonHoverState() )
        .on('pointerout', () => this.enterButtonRestState() )
        .on('pointerdown', () => this.enterButtonActiveState(callback) )
        .on('pointerup', () => {
          this.enterButtonHoverState();
          endCallback();
        })
    }

    enterButtonHoverState() {
      this.setStyle({ fill: '#ff0 '});
    }

    enterButtonRestState() {
      this.setStyle({ fill: '#0f0 '});
    }

    enterButtonActiveState(callback) {
      this.setStyle({ fill: '#0ff' });
      callback();
    }
}
