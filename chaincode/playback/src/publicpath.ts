// We assume the current script runs at the base path. Simply extract out its filename and then use that path
// as the base
const base = (document.currentScript as HTMLScriptElement).src;

// Need to also set webpack_public_path on the window given the below bug
// tslint:disable-next-line:no-string-literal
__webpack_public_path__ = base.substr(0, base.lastIndexOf("/") + 1);
