"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthRouteSchema = void 0;
var common_schema_1 = require("../responses/common.schema");
exports.HealthRouteSchema = {
    tags: ['health'],
    summary: 'Health check endpoint',
    description: 'Check if the server is running and healthy',
    response: {
        200: common_schema_1.HealthResponseSchema,
    },
};
