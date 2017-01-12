// Various helpers functions

// Utility to fetch elements by ID
export function id(elementId: string): HTMLElement {
  return <HTMLElement>(document.getElementById(elementId));
}

export function displayStatus(message: string) {
  console.log("status:", message);
}

export function displayError(message: string) {
  console.log("error: ", message);
}

export function makeElementVisible(elem, visible) {
  elem.style.display = visible ? "block" : "none";
}

// Convenience function used by color converters.
export function byteHex(num: number) {
  var hex = num.toString(16);
  if (hex.length === 1) {
    hex = "0" + hex;
  }
  return hex;
}

// -----------------------------------------
// Color Wrangling
// -----------------------------------------

export interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function toColorString(color: IColor) {
  return "#" + byteHex(color.r) + byteHex(color.g) + byteHex(color.b) + byteHex(color.a);
}

// Helper function to support HTML hexColor Strings
export function hexStrToRGBA(hexStr: string): IColor {
  // RGBA color object
  var colorObject: IColor = { r: 255, g: 255, b: 255, a: 255 };

  // remove hash if it exists
  hexStr = hexStr.replace('#', '');

  if (hexStr.length === 6) {
    // No Alpha
    colorObject.r = parseInt(hexStr.slice(0, 2), 16);
    colorObject.g = parseInt(hexStr.slice(2, 4), 16);
    colorObject.b = parseInt(hexStr.slice(4, 6), 16);
    colorObject.a = parseInt('0xFF', 16);
  } else if (hexStr.length === 8) {
    // Alpha
    colorObject.r = parseInt(hexStr.slice(0, 2), 16);
    colorObject.g = parseInt(hexStr.slice(2, 4), 16);
    colorObject.b = parseInt(hexStr.slice(4, 6), 16);
    colorObject.a = parseInt(hexStr.slice(6, 8), 16);
  } else if (hexStr.length === 3) {
    // Shorthand hex color
    var rVal = hexStr.slice(0, 1);
    var gVal = hexStr.slice(1, 2);
    var bVal = hexStr.slice(2, 3);
    colorObject.r = parseInt(rVal + rVal, 16);
    colorObject.g = parseInt(gVal + gVal, 16);
    colorObject.b = parseInt(bVal + bVal, 16);
  } else {
    throw new Error('Invalid HexString length. Expected either 8, 6, or 3. The actual length was ' + hexStr.length);
  }
  return colorObject;
}


// Convert from the few color names used in this app to Windows.UI.Input.Inking's color code.
// If it isn't one of those, then decode the hex string.  Otherwise return gray.
// The alpha component is always set to full (255).
export function toColorStruct(color: string): IColor {
  switch (color) {
    // Ink colors
    case "Black": return { r: 0x00, g: 0x00, b: 0x00, a: 0xff }
    case "Blue": return { r: 0x00, g: 0x00, b: 0xff, a: 0xff }
    case "Red": return { r: 0xff, g: 0x00, b: 0x00, a: 0xff }
    case "Green": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff }
    // Highlighting colors
    case "Yellow": return { r: 0xff, g: 0xff, b: 0x00, a: 0xff }
    case "Aqua": return { r: 0x66, g: 0xcd, b: 0xaa, a: 0xff }
    case "Lime": return { r: 0x00, g: 0xff, b: 0x00, a: 0xff }
    // Select colors
    case "Gold": return { r: 0xff, g: 0xd7, b: 0x00, a: 0xff }
    case "White": return { r: 0xff, g: 0xff, b: 0xff, a: 0xff }
  }
  return hexStrToRGBA(color);
}


// ----------------------------------------------------------------------
// URL/Path parsing stuff
// ----------------------------------------------------------------------
export function breakFilePath(path) {
  var m = path.match(/(.*)[\/\\]([^\/\\]+)\.(\w+)/);
  if (m)
    return { source: m[0], path: m[1], filename: m[2], ext: m[3] };
  else
    return { source: m[0], path: "", filename: "", ext: "" };
}

export function parseURL(url) {
  var a = document.createElement('a');
  a.href = url;
  var parts = breakFilePath(a.pathname);
  return {
    source: url,
    protocol: a.protocol.replace(':', ''),
    host: a.hostname,
    port: a.port,
    query: a.search,
    params: (function () {
      var ret = {};
      var seg = a.search.replace(/^\?/, '').split('&');
      var len = seg.length;
      var i = 0;
      var s;
      for (; i < len; i++) {
        if (!seg[i]) { continue; }
        s = seg[i].split('=');
        ret[s[0]] = s[1];
      }
      return ret;
    })(),
    path: parts.path,
    segments: parts.path.replace(/^\//, '').split('/'),
    file: parts.filename,
    ext: parts.ext,
    hash: a.hash.replace('#', ''),
  };
}
