"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserParamsSchema = exports.UpdateUserRequestSchema = void 0;
exports.UpdateUserRequestSchema = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            description: 'Updated user display name',
        },
    },
    additionalProperties: false,
};
exports.UserParamsSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            format: 'uuid',
            description: 'User unique identifier',
        },
    },
    required: ['id'],
};
