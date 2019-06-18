/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Hash from "sha.js/sha1";
import { types } from "./types";

function padHex(b: number, n: number) {
    const s = n.toString(16);
    return "0".repeat(b - s.length) + s;
}

// tslint:disable no-bitwise

export async function pack(oids: any[]) {
  const hash = new Hash();
  const outputStream = [];
  function write(chunk, enc = "base64") {
    const buff = Buffer.from(chunk, enc);
    outputStream.push(buff);
    hash.update(buff);
  }
  function writeObject({ stype, object }) {
    let lastFour;
    let multibyte;
    // Object type is encoded in bits 654
    const type = types[stype];
    // The length encoding gets complicated.
    let length = object.length;
    // Whether the next byte is part of the variable-length encoded number
    // is encoded in bit 7
    multibyte = length > 0b1111 ? 0b10000000 : 0b0;
    // Last four bits of length is encoded in bits 3210
    lastFour = length & 0b1111;
    // Discard those bits
    length = length >>> 4;
    // The first byte is then (1-bit multibyte?), (3-bit type), (4-bit least sig 4-bits of length)
    const byte = (multibyte | type | lastFour).toString(16);
    write(byte, "hex");
    // Now we keep chopping away at length 7-bits at a time until its zero,
    // writing out the bytes in what amounts to little-endian order.
    while (multibyte) {
      multibyte = length > 0b01111111 ? 0b10000000 : 0b0;
      const moreByte = multibyte | (length & 0b01111111);
      write(padHex(2, moreByte), "hex");
      length = length >>> 7;
    }
    // Lastly, we can compress and write the object.
    // write(Buffer.from(pako.deflate(object)))
    // I think we can write object directly without deflating
    write(Buffer.from(object));
  }
  write("PACK");
  write("00000002", "hex");
  // Write a 4 byte (32-bit) int
  write(padHex(8, oids.length), "hex");

  for (const oid of oids) {
    console.log(oid);
    // let { type, object } = await readObject({ fs, gitdir, oid })
    // writeObject({ write, object, stype: type })
    const { type, object} = oid;
    writeObject({ object, stype: type });
  }
  // Write SHA1 checksum
  const digest = hash.digest();
  outputStream.push(digest);
  return outputStream;
}
