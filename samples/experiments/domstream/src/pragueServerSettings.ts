const localServer = "localhost";

// For local development
const localSettings = {
    historian: "http://" + localServer + ":3001",
    routerlicious: "http://" + localServer + ":3000",
    secret: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    tenantId: "prague",
};
const remoteSettings = {
    historian: "https://historian.eu2.prague.office-int.com",
    routerlicious: "https://alfred.eu2.prague.office-int.com",
    secret: "6b423d81f626ad6e6f8a9637a32f00a9",
    tenantId: "heuristic-noyce",
};

export const settingCollection = {
    east_us: remoteSettings,
    localhost: localSettings,
};
