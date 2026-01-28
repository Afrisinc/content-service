"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetProfileRouteSchema = exports.LoginRouteSchema = exports.RegisterRouteSchema = void 0;
var auth_schema_1 = require("../requests/auth.schema");
var auth_schema_2 = require("../responses/auth.schema");
var common_schema_1 = require("../responses/common.schema");
exports.RegisterRouteSchema = {
    tags: ['auth'],
    summary: 'Register a new user',
    description: 'Create a new user account with email and password',
    body: auth_schema_1.RegisterRequestSchema,
    response: {
        201: auth_schema_2.RegisterResponseSchema,
        400: common_schema_1.ErrorResponseSchema,
    },
};
exports.LoginRouteSchema = {
    tags: ['auth'],
    summary: 'Login user',
    description: 'Authenticate user with email and password, returns JWT token',
    body: auth_schema_1.LoginRequestSchema,
    response: {
        200: auth_schema_2.LoginResponseSchema,
        400: common_schema_1.ErrorResponseSchema,
    },
};
exports.GetProfileRouteSchema = {
    tags: ['auth'],
    summary: 'Get user profile',
    description: 'Retrieve authenticated user profile information',
    security: [{ bearerAuth: [] }],
    response: {
        200: auth_schema_2.ProfileResponseSchema,
        401: common_schema_1.ErrorResponseSchema,
    },
};
