import { ALL_SCHEMAS } from './';

export const registerSchemas = function(propertyFactory: any) {
    Object.values(ALL_SCHEMAS).forEach(schemas  => {
        propertyFactory.register(Object.values(schemas));
    })
}
