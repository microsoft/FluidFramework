// Note: 'index.tsx' is only imported when testing with the local WebPack dev server.
//       In production it is Alfred's '/controllers/view.ts' that calls 'start(..)'

import { start } from "@prague/flow-host";

const serverUrl = new URL(document.location.href);
serverUrl.port = "3000";

const verdaccioUrl = new URL(serverUrl.origin);
verdaccioUrl.port = "4873";

start({
    serverUrl: serverUrl.origin,
    verdaccioUrl: verdaccioUrl.toString()
}, document.body);