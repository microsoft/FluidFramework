const localServer = "localhost";

// For local development
const localSettings = {
    historian: "http://" + localServer + ":3001",
    routerlicious: "http://" + localServer + ":3000",
    secret: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    tenantId: "prague",
};
const remoteSettings = {
    historian: "https://historian.eu.prague.office-int.com",
    routerlicious: "https://alfred.eu.prague.office-int.com",
    secret: "04d35da60eed66c9a2272bdf310d076e",
    tenantId: "trusting-tesla",
};

export const settingCollection = {
    east_us: remoteSettings,
    localhost: localSettings,
};
