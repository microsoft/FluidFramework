import * as jwt from "jsonwebtoken";

export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: string;
}

/**
 * Middleware to check authentication and passing token.
 */
export function ensureAuthenticated(tenantId: string, signingKey: string) {
    return (req, res, next) => {
        if (req.isAuthenticated()) {
            res.locals.token = generateToken(req, tenantId, signingKey);
            return next();
        }
        res.redirect("/");
    };
  }

/**
 * Generates a JWT token to authorize against routerlicious.
 */
export function generateToken(request: any, tenantId: string, signingKey: string): string {
    const claims: ITokenClaims = {
        documentId: request.params.id,
        permission: "read:write",
        tenantId,
        user: request.user.displayName,
    };

    return jwt.sign(claims, signingKey);
}
