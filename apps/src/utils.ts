/**
 * Helper function to return the composite identifier that combines a tenant id and a document id
 */
export function getFullId(tenantId: string, documentId: string): string {
    return tenantId ? `${tenantId}/${documentId}` : documentId;
}
