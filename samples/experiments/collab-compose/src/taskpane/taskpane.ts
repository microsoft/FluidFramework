/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

Office.onReady(info => {
  if (info.host === Office.HostType.Outlook) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = run;
  }
});

export async function run() {
  const messageCompose = Office.context.mailbox.item as Office.MessageCompose;
  let value = 0;
  messageCompose.body.setAsync(`HELLLOOOOO! ${value++}`, { coercionType: Office.CoercionType.Text });
  setInterval(
    () => {
      messageCompose.body.setAsync(`HELLLOOOOO! ${value++}`, { coercionType: Office.CoercionType.Text });
    },
    5000);
}
