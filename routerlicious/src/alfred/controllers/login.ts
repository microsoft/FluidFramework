import * as $ from "jquery";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";

async function assignKeypair(): Promise<boolean> {
    const {privateKey, publicKey} = await api.generateAsymmetricKeys(2048, "", "");
    (<HTMLTextAreaElement> document.getElementById("privateKey")).textContent = privateKey;
    (<HTMLTextAreaElement> document.getElementById("publicKey")).textContent = publicKey;
    document.getElementById("assignKeypair").style.display = "none";
    return true;
}

function userLoggedIn(): boolean {
    if (api.isUserLoggedIn()) {
        const {user, keyPackage} = api.getLoggedInUserPackage();
        (<HTMLInputElement> document.getElementById("username")).value = user;
        (<HTMLTextAreaElement> document.getElementById("privateKey")).textContent = keyPackage.privateKey;
        (<HTMLTextAreaElement> document.getElementById("publicKey")).textContent = keyPackage.publicKey;
        return true;
    }

    return false;
}

function loginUser(): boolean {
    const username: string = (<HTMLInputElement> document.getElementById("username")).value;
    const privateKey: string = (<HTMLTextAreaElement> document.getElementById("privateKey")).value;
    const publicKey: string = (<HTMLTextAreaElement> document.getElementById("publicKey")).value;

    if (!username || !privateKey || !publicKey) {
        alert("ERROR: Must enter data in all fields!");
        // NOTE: Do some further validation on keys to make sure they are useable.
        // NOTE: If using a KV pair in localStorage to designate whether or not *someone* is signed in, make sure to
        // reserve a name to indicate no one is logged in (e.g. disallow username "false")
        return false;
    }

    /* Store/overwrite credentials. */
    api.setLoggedInUser(username, {privateKey, publicKey});

    /* Disable login button. */
    toggleShowLogin();

    return true;
}

function logoutUser(): boolean {
    if (!api.isUserLoggedIn()) {
        alert("ERROR: No user logged in!");
        return false;
    }

    /* Remove user from localStorage. */
    api.logoutUser();

    /* Enable login button. */
    toggleShowLogin();

    /* Clear fields. */
    (<HTMLInputElement> document.getElementById("username")).value = "";
    (<HTMLTextAreaElement> document.getElementById("privateKey")).textContent = "";
    (<HTMLTextAreaElement> document.getElementById("publicKey")).textContent = "";

    return true;
}

function toggleShowLogin(): void {
    if (document.getElementById("logout-button").style.display === "none") {
        document.getElementById("assignKeypair").style.display = "none";
        document.getElementById("login-button").style.display = "none";
        document.getElementById("logout-button").style.display = "block";

        /* Display logged in indicator. */
        let loginIndicator = document.getElementById("login-indicator");
        let spanText = loginIndicator.getElementsByTagName("span")[0];
        const username: string = (<HTMLInputElement> document.getElementById("username")).value;
        spanText.textContent = "Welcome back, " + username + "!";
        document.getElementById("login-indicator").style.display = "block";
    } else {
        document.getElementById("assignKeypair").style.display = "block";
        document.getElementById("login-button").style.display = "block";
        document.getElementById("logout-button").style.display = "none";

        /* Disable login indicator. */
        document.getElementById("login-indicator").style.display = "none";
    }
}

export function load(config: any) {
    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);

    $(document).ready(() => {

        // Add event listeners.
        document.getElementById("login-button").addEventListener("click", loginUser);
        document.getElementById("login-button").addEventListener("submit", (event) => {
            event.preventDefault();
        });
        document.getElementById("logout-button").addEventListener("click", logoutUser);
        document.getElementById("logout-button").addEventListener("submit", (event) => {
            event.preventDefault();
        });
        document.getElementById("assignKeypair").addEventListener("click", assignKeypair);
        document.getElementById("assignKeypair").addEventListener("submit", (event) => {
            event.preventDefault();
        });

        // Toggle login/logout buttons to correct initial format.
        if (userLoggedIn()) {
            toggleShowLogin();
        }
    });
}
