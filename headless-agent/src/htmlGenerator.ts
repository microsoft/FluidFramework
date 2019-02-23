const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "thirsty-shirley";
const secret = "f793c1603cf75ea41a09804e94f43cd2";

// cheating 1: Should figure out main.bundle.js and window["main"]
export function generateHtml(docId: string) {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${docId}</title>
    </head>
    <script>
    loader.startLoading("${docId}", window["main"],
        "${routerlicious}", "${historian}",
        "${tenantId}", "${secret}")
    .catch((error) => console.error(error));
    </script>
    <body>
        <div style="width: 100vw; height: 100vh;">
            <div id="content"></div>
        </div>
    </body>
    </html>`;
    return html;
}
