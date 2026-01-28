"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthResponseSchema = exports.ErrorResponseSchema = exports.SuccessResponseSchema = void 0;
var SuccessResponseSchema = function (dataSchema) {
    return ({
        type: 'object',
        properties: {
            success: {
                type: 'boolean',
                example: true,
                description: 'Indicates if the request was successful',
            },
            message: {
                type: 'string',
                description: 'Success message describing the operation',
            },
            data: dataSchema,
        },
        required: ['success', 'message'],
    });
};
exports.SuccessResponseSchema = SuccessResponseSchema;
exports.ErrorResponseSchema = {
    type: 'object',
    properties: {
        success: {
            type: 'boolean',
            example: false,
            description: 'Indicates that the request failed',
        },
        message: {
            type: 'string',
            description: 'Error message describing what went wrong',
        },
    },
    required: ['success', 'message'],
};
exports.HealthResponseSchema = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            example: 'ok',
            description: 'Server status indicator',
        },
        message: {
            type: 'string',
            example: 'Server is running',
            description: 'Server status message',
        },
    },
    required: ['status', 'message'],
};
