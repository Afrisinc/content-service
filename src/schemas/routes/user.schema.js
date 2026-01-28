"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserRouteSchema = exports.GetUserRouteSchema = void 0;
var user_schema_1 = require("../requests/user.schema");
var user_schema_2 = require("../entities/user.schema");
var common_schema_1 = require("../responses/common.schema");
exports.GetUserRouteSchema = {
    tags: ['users'],
    summary: 'Get user profile',
    description: 'Retrieve user profile information by user ID',
    params: user_schema_1.UserParamsSchema,
    response: {
        200: (0, common_schema_1.SuccessResponseSchema)(__assign(__assign({}, user_schema_2.UserPublicSchema), { description: 'User profile data' })),
        400: common_schema_1.ErrorResponseSchema,
        404: common_schema_1.ErrorResponseSchema,
    },
};
exports.UpdateUserRouteSchema = {
    tags: ['users'],
    summary: 'Update user profile',
    description: 'Update user profile information',
    params: user_schema_1.UserParamsSchema,
    body: user_schema_1.UpdateUserRequestSchema,
    response: {
        200: (0, common_schema_1.SuccessResponseSchema)(__assign(__assign({}, user_schema_2.UserPublicSchema), { description: 'Updated user profile data' })),
        400: common_schema_1.ErrorResponseSchema,
        404: common_schema_1.ErrorResponseSchema,
    },
};
