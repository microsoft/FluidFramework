import { TokenManager } from "../tokenManager";

const tokenManager = new TokenManager();

/**
 * Middleware to check authentication and passing token.
 */
export function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        res.locals.token = tokenManager.getOrCreateToken(req.user.upn);
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
