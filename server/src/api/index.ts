import { PostMessageHost } from './post-message-host';
import { PostMessageHostServer } from './post-message-host-server';
import { IHost } from './host';
 
export * from './interfaces';
export { PostMessageHostServer };

function detectHost(): IHost {
    if (window !== top) {
        let host = new PostMessageHost(window);
        host.start();

        return host;
    }

    // No host available
    return null;
}

export var pnhost = detectHost();