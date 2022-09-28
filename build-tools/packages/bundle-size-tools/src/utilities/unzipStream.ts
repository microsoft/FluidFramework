/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as JSZip from 'jszip';

function readStreamAsBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const data: any[] = [];
    stream.on('data', (chunk) => {
      data.push(chunk);
    });
    stream.on('close', () => {
      resolve(Buffer.concat(data));
    });
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

export async function unzipStream(stream: NodeJS.ReadableStream) {
  return JSZip.loadAsync(await readStreamAsBuffer(stream));
}
