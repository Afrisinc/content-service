"use strict";
/**
 * Social Media Routes
 * Defines all endpoints for social media operations
 */
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socialMediaRoutes = socialMediaRoutes;
var socialMedia_controller_1 = require("../controllers/socialMedia.controller");
var socialMedia_schema_1 = require("@/schemas/requests/socialMedia.schema");
var authGuard_1 = require("../middlewares/authGuard");
function socialMediaRoutes(app) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // POST: Create a new social media post
            app.post('/social-media/post', {
                schema: __assign(__assign({}, socialMedia_schema_1.PostToSocialMediaSchema), { description: 'Post content to social media platform' }),
            }, socialMedia_controller_1.postToSocialMedia);
            // POST: Batch post to multiple platforms
            app.post('/social-media/batch', {
                schema: {
                    description: 'Post to multiple platforms in a single request',
                    tags: ['social-media'],
                    body: {
                        type: 'array',
                        items: socialMedia_schema_1.PostToSocialMediaSchema.body,
                        description: 'Array of social media post requests',
                        minItems: 1,
                        maxItems: 10,
                    },
                    response: {
                        201: {
                            type: 'object',
                            properties: {
                                success: {
                                    type: 'boolean',
                                },
                                message: {
                                    type: 'string',
                                },
                                data: {
                                    type: 'object',
                                    properties: {
                                        results: {
                                            type: 'array',
                                        },
                                        summary: {
                                            type: 'object',
                                            properties: {
                                                total: { type: 'number' },
                                                success: { type: 'number' },
                                                failed: { type: 'number' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }, socialMedia_controller_1.batchPostToSocialMedia);
            // GET: Retrieve post details
            app.get('/social-media/posts/:postId', {
                schema: __assign(__assign({}, socialMedia_schema_1.GetSocialMediaPostSchema), { description: 'Get details of a published social media post' }),
            }, socialMedia_controller_1.getSocialMediaPost);
            // DELETE: Remove a posted social media post
            app.delete('/social-media/posts/:postId', {
                schema: {
                    description: 'Delete a published social media post',
                    tags: ['social-media'],
                    params: {
                        type: 'object',
                        required: ['postId'],
                        properties: {
                            postId: {
                                type: 'string',
                                description: 'Social media post ID',
                            },
                        },
                    },
                    querystring: {
                        type: 'object',
                        required: ['accessToken', 'platform'],
                        properties: {
                            accessToken: {
                                type: 'string',
                                description: 'Platform access token',
                            },
                            platform: {
                                type: 'string',
                                enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
                                description: 'Social media platform',
                            },
                        },
                    },
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                success: {
                                    type: 'boolean',
                                },
                                message: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                },
            }, socialMedia_controller_1.deleteSocialMediaPost);
            // POST: Validate payload without posting
            app.post('/social-media/validate', {
                schema: {
                    description: 'Validate social media post payload without posting',
                    tags: ['social-media'],
                    body: socialMedia_schema_1.PostToSocialMediaSchema.body,
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                success: {
                                    type: 'boolean',
                                },
                                message: {
                                    type: 'string',
                                },
                                data: {
                                    type: 'object',
                                },
                            },
                        },
                    },
                },
            }, socialMedia_controller_1.validateSocialMediaPayload);
            // GET: Get all social media posts
            app.get('/social-media/posts', {
                schema: {
                    tags: ['social-media'],
                    summary: 'Get all social media posts',
                    description: 'Retrieve all published social media posts with optional filtering',
                    querystring: {
                        type: 'object',
                        properties: {
                            platform: {
                                type: 'string',
                                enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
                                description: 'Filter by platform (optional)',
                            },
                            status: {
                                type: 'string',
                                enum: ['pending', 'published', 'failed', 'deleted'],
                                description: 'Filter by status (optional)',
                            },
                            limit: {
                                type: 'integer',
                                default: 20,
                                maximum: 100,
                                description: 'Number of posts to return',
                            },
                            offset: {
                                type: 'integer',
                                default: 0,
                                description: 'Number of posts to skip',
                            },
                        },
                    },
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                message: { type: 'string' },
                                data: {
                                    type: 'object',
                                    properties: {
                                        posts: {
                                            type: 'array',
                                        },
                                        total: { type: 'integer' },
                                        limit: { type: 'integer' },
                                        offset: { type: 'integer' },
                                    },
                                },
                            },
                        },
                    },
                },
            }, socialMedia_controller_1.getAllSocialMediaPosts);
            // GET: Get user's social media posts
            app.get('/social-media/user/posts', {
                schema: {
                    tags: ['social-media'],
                    summary: 'Get user posts',
                    description: "Retrieve authenticated user's social media posts",
                    security: [{ bearerAuth: [] }],
                    querystring: {
                        type: 'object',
                        properties: {
                            platform: {
                                type: 'string',
                                enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
                                description: 'Filter by platform (optional)',
                            },
                            status: {
                                type: 'string',
                                enum: ['pending', 'published', 'failed', 'deleted'],
                                description: 'Filter by status (optional)',
                            },
                            limit: {
                                type: 'integer',
                                default: 20,
                                maximum: 100,
                                description: 'Number of posts to return',
                            },
                            offset: {
                                type: 'integer',
                                default: 0,
                                description: 'Number of posts to skip',
                            },
                        },
                    },
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                message: { type: 'string' },
                                data: {
                                    type: 'object',
                                    properties: {
                                        posts: {
                                            type: 'array',
                                        },
                                        total: { type: 'integer' },
                                        limit: { type: 'integer' },
                                        offset: { type: 'integer' },
                                    },
                                },
                            },
                        },
                        401: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
                onRequest: [authGuard_1.authGuard],
            }, socialMedia_controller_1.getUserSocialMediaPosts);
            return [2 /*return*/];
        });
    });
}
