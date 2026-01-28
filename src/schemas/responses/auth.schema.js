"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileResponseSchema = exports.LoginResponseSchema = exports.RegisterResponseSchema = exports.AuthDataSchema = void 0;
var user_schema_1 = require("../entities/user.schema");
exports.AuthDataSchema = {
    type: 'object',
    properties: {
        user: user_schema_1.UserPublicSchema,
        token: {
            type: 'string',
            description: 'JWT authentication token',
        },
    },
    required: ['user', 'token'],
};
exports.RegisterResponseSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User registered successfully' },
        data: exports.AuthDataSchema,
    },
    required: ['success', 'message', 'data'],
};
exports.LoginResponseSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Login successful' },
        data: exports.AuthDataSchema,
    },
    required: ['success', 'message', 'data'],
};
exports.ProfileResponseSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Profile retrieved successfully' },
        data: user_schema_1.UserPublicSchema,
    },
    required: ['success', 'message', 'data'],
};
