import { TokenManager } from "../tokenManager";

let tokenManager: TokenManager;

export function initAuthChecker(tenantConfig: any) {
    tokenManager = new TokenManager(tenantConfig.id, tenantConfig.secretKey, tenantConfig.symmetricKey);
}

/**
 * Middleware to check authentication and passing token.
 */
export function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        res.locals.token = tokenManager.getOrCreateToken(req.user.upn, req.user.displayName);
        return next();
    }
    res.redirect("/");
}

/**
 * Clears a token.
 */
export function clearToken(email: string) {
    tokenManager.clearToken(email);
}
