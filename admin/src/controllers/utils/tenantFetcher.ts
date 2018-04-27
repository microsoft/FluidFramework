import * as request from "request-promise-native";

export async function addTenant(url: string, tenant: any): Promise<any> {
    const newTenant = await request.post(
        `${url}/api/tenants`,
        {
            body: {
                name: tenant.name,
                storage: tenant.storage,
            },
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        });
    console.log(newTenant);
    return newTenant;
}

export async function deleteTenant(url: string, tenantId: string): Promise<string> {
    await request.delete(
        `${url}/api/tenants/${tenantId}`,
        {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        },
    );
    return tenantId;
}
