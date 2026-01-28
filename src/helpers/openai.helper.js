"use strict";
/**
 * OpenAI Helper
 * Handles all OpenAI API interactions for content generation
 */
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiHelper = void 0;
var logger_1 = require("@/utils/logger");
var openai_1 = require("openai");
var OpenAIHelper = /** @class */ (function () {
    function OpenAIHelper() {
        var apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logger_1.logger.warn('OPENAI_API_KEY is not configured');
        }
        this.client = new openai_1.default({
            apiKey: apiKey || '',
        });
        this.textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4';
        this.imageModel = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
    }
    /**
     * Validate OpenAI configuration
     */
    OpenAIHelper.prototype.validateConfiguration = function () {
        var errors = [];
        if (!process.env.OPENAI_API_KEY) {
            errors.push('OPENAI_API_KEY environment variable is not set');
        }
        if (!this.textModel) {
            errors.push('OPENAI_TEXT_MODEL environment variable is not set');
        }
        if (!this.imageModel) {
            errors.push('OPENAI_IMAGE_MODEL environment variable is not set');
        }
        return {
            valid: errors.length === 0,
            errors: errors,
        };
    };
    /**
     * Build system prompt for content generation
     */
    OpenAIHelper.prototype.buildSystemPrompt = function (config) {
        var parts = [
            'You are a professional social media content creator.',
            'Generate engaging, authentic, and platform-appropriate content.',
        ];
        if (config.tone) {
            parts.push("Use a ".concat(config.tone, " tone."));
        }
        if (config.language) {
            parts.push("Write in ".concat(config.language, "."));
        }
        if (config.includeEmojis) {
            parts.push('Include relevant emojis to increase engagement.');
        }
        if (config.includeHashtags) {
            parts.push('Include relevant hashtags at the end.');
        }
        if (config.maxLength) {
            parts.push("Keep content under ".concat(config.maxLength, " characters for each platform."));
        }
        return parts.join(' ');
    };
    /**
     * Build user message for content generation
     */
    OpenAIHelper.prototype.buildUserMessage = function (request) {
        if (request.platform) {
            return "Create a social media post for ".concat(request.platform, " based on this prompt: ").concat(request.prompt);
        }
        return "Create engaging social media posts for Facebook and Instagram based on this prompt: ".concat(request.prompt, ".\n\n    Return the response in JSON format with the following structure:\n    {\n      \"facebook\": \"content for facebook\",\n      \"instagram\": \"content for instagram\",\n      \"hashtags\": [\"tag1\", \"tag2\"]\n    }");
    };
    /**
     * Generate content using OpenAI API with official SDK
     */
    OpenAIHelper.prototype.generateContent = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var config, message, content, parsedContent, jsonMatch, platform, platform, result, error_1;
            var _a, _b;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        config = this.validateConfiguration();
                        if (!config.valid) {
                            throw new Error("OpenAI configuration invalid: ".concat(config.errors.join(', ')));
                        }
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        logger_1.logger.info({
                            prompt: request.prompt.substring(0, 100),
                            platform: request.platform,
                            model: this.textModel,
                        }, 'Generating content with OpenAI');
                        return [4 /*yield*/, this.client.chat.completions.create({
                                model: this.textModel,
                                max_tokens: request.maxLength ? request.maxLength * 2 : 1024,
                                messages: [
                                    {
                                        role: 'system',
                                        content: this.buildSystemPrompt(request),
                                    },
                                    {
                                        role: 'user',
                                        content: this.buildUserMessage(request),
                                    },
                                ],
                                temperature: 0.7,
                            })];
                    case 2:
                        message = _e.sent();
                        content = message.choices[0].message.content || '';
                        if (!content) {
                            throw new Error('No content received from OpenAI');
                        }
                        parsedContent = void 0;
                        try {
                            jsonMatch = content.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                parsedContent = JSON.parse(jsonMatch[0]);
                            }
                            else {
                                platform = request.platform || 'facebook';
                                parsedContent = request.platform ? (_a = {}, _a[platform] = content, _a) : { facebook: content, instagram: content };
                            }
                        }
                        catch (_f) {
                            platform = request.platform || 'facebook';
                            parsedContent = request.platform ? (_b = {}, _b[platform] = content, _b) : { facebook: content, instagram: content };
                        }
                        result = {
                            facebook: parsedContent.facebook,
                            instagram: parsedContent.instagram,
                            twitter: parsedContent.twitter,
                            linkedin: parsedContent.linkedin,
                            tiktok: parsedContent.tiktok,
                            hashtags: parsedContent.hashtags || [],
                            metadata: {
                                model: this.textModel,
                                provider: 'openai',
                                generationPrompt: request.prompt,
                                timestamp: new Date().toISOString(),
                                tokensUsed: (_c = message.usage) === null || _c === void 0 ? void 0 : _c.completion_tokens,
                            },
                        };
                        logger_1.logger.info({
                            platforms: Object.keys(result).filter(function (k) { return k !== 'metadata'; }),
                            tokensUsed: (_d = message.usage) === null || _d === void 0 ? void 0 : _d.completion_tokens,
                        }, 'Content generation successful');
                        return [2 /*return*/, result];
                    case 3:
                        error_1 = _e.sent();
                        logger_1.logger.error({
                            prompt: request.prompt.substring(0, 100),
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        }, 'Content generation failed');
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate content for specific platform
     */
    OpenAIHelper.prototype.generateContentForPlatform = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var result, platform, content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.generateContent(request)];
                    case 1:
                        result = _a.sent();
                        platform = request.platform || 'facebook';
                        content = result[platform];
                        if (!content || typeof content !== 'string') {
                            throw new Error("No content generated for platform: ".concat(platform));
                        }
                        return [2 /*return*/, content];
                }
            });
        });
    };
    /**
     * Generate content for multiple platforms
     */
    OpenAIHelper.prototype.generateContentForMultiplePlatforms = function (request, platforms) {
        return __awaiter(this, void 0, void 0, function () {
            var result, output, _i, platforms_1, platform, content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.generateContent(request)];
                    case 1:
                        result = _a.sent();
                        output = {};
                        for (_i = 0, platforms_1 = platforms; _i < platforms_1.length; _i++) {
                            platform = platforms_1[_i];
                            content = result[platform];
                            if (content && typeof content === 'string') {
                                output[platform] = content;
                            }
                        }
                        return [2 /*return*/, output];
                }
            });
        });
    };
    /**
     * Stream content generation for real-time display
     */
    OpenAIHelper.prototype.generateContentStream = function (request) {
        return __asyncGenerator(this, arguments, function generateContentStream_1() {
            var config, stream, _a, stream_1, stream_1_1, chunk, e_1_1, error_2;
            var _b, e_1, _c, _d;
            var _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        config = this.validateConfiguration();
                        if (!config.valid) {
                            throw new Error("OpenAI configuration invalid: ".concat(config.errors.join(', ')));
                        }
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 17, , 18]);
                        logger_1.logger.info({
                            prompt: request.prompt.substring(0, 100),
                            streaming: true,
                        }, 'Starting streaming content generation');
                        return [4 /*yield*/, __await(this.client.chat.completions.create({
                                model: this.textModel,
                                max_tokens: request.maxLength ? request.maxLength * 2 : 1024,
                                messages: [
                                    {
                                        role: 'system',
                                        content: this.buildSystemPrompt(request),
                                    },
                                    {
                                        role: 'user',
                                        content: this.buildUserMessage(request),
                                    },
                                ],
                                temperature: 0.7,
                                stream: true,
                            }))];
                    case 2:
                        stream = _g.sent();
                        _g.label = 3;
                    case 3:
                        _g.trys.push([3, 10, 11, 16]);
                        _a = true, stream_1 = __asyncValues(stream);
                        _g.label = 4;
                    case 4: return [4 /*yield*/, __await(stream_1.next())];
                    case 5:
                        if (!(stream_1_1 = _g.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 9];
                        _d = stream_1_1.value;
                        _a = false;
                        chunk = _d;
                        if (!((_f = (_e = chunk.choices[0]) === null || _e === void 0 ? void 0 : _e.delta) === null || _f === void 0 ? void 0 : _f.content)) return [3 /*break*/, 8];
                        return [4 /*yield*/, __await(chunk.choices[0].delta.content)];
                    case 6: return [4 /*yield*/, _g.sent()];
                    case 7:
                        _g.sent();
                        _g.label = 8;
                    case 8:
                        _a = true;
                        return [3 /*break*/, 4];
                    case 9: return [3 /*break*/, 16];
                    case 10:
                        e_1_1 = _g.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 16];
                    case 11:
                        _g.trys.push([11, , 14, 15]);
                        if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 13];
                        return [4 /*yield*/, __await(_c.call(stream_1))];
                    case 12:
                        _g.sent();
                        _g.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 15: return [7 /*endfinally*/];
                    case 16:
                        logger_1.logger.info({}, 'Streaming content generation completed');
                        return [3 /*break*/, 18];
                    case 17:
                        error_2 = _g.sent();
                        logger_1.logger.error({
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        }, 'Content streaming failed');
                        throw error_2;
                    case 18: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate content with vision (image analysis)
     */
    OpenAIHelper.prototype.generateContentWithVision = function (imageUrl, prompt) {
        return __awaiter(this, void 0, void 0, function () {
            var config, message, content, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.validateConfiguration();
                        if (!config.valid) {
                            throw new Error("OpenAI configuration invalid: ".concat(config.errors.join(', ')));
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        logger_1.logger.info({
                            imageUrl: imageUrl.substring(0, 50),
                            model: this.textModel,
                        }, 'Generating content from image');
                        return [4 /*yield*/, this.client.chat.completions.create({
                                model: this.textModel,
                                max_tokens: 1024,
                                messages: [
                                    {
                                        role: 'user',
                                        content: [
                                            {
                                                type: 'image_url',
                                                image_url: {
                                                    url: imageUrl,
                                                },
                                            },
                                            {
                                                type: 'text',
                                                text: prompt,
                                            },
                                        ],
                                    },
                                ],
                            })];
                    case 2:
                        message = _a.sent();
                        content = message.choices[0].message.content || '';
                        if (!content) {
                            throw new Error('No content generated from image');
                        }
                        return [2 /*return*/, content];
                    case 3:
                        error_3 = _a.sent();
                        logger_1.logger.error({
                            error: error_3 instanceof Error ? error_3.message : String(error_3),
                        }, 'Vision content generation failed');
                        throw error_3;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate image using DALL-E
     */
    OpenAIHelper.prototype.generateImage = function (prompt, style) {
        return __awaiter(this, void 0, void 0, function () {
            var config, stylePrompt, response, imageUrl, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.validateConfiguration();
                        if (!config.valid) {
                            throw new Error("OpenAI configuration invalid: ".concat(config.errors.join(', ')));
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        stylePrompt = style ? " in a ".concat(style, " style") : '';
                        logger_1.logger.info({
                            prompt: prompt.substring(0, 50),
                            style: style || 'default',
                        }, 'Generating image with DALL-E');
                        return [4 /*yield*/, this.client.images.generate({
                                model: this.imageModel,
                                prompt: "".concat(prompt).concat(stylePrompt),
                                n: 1,
                                size: '1024x1024',
                                quality: 'standard',
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.data || response.data.length === 0) {
                            throw new Error('No image generated');
                        }
                        imageUrl = response.data[0].url;
                        if (!imageUrl) {
                            throw new Error('Image URL not returned from API');
                        }
                        logger_1.logger.info({
                            prompt: prompt.substring(0, 50),
                        }, 'Image generation successful');
                        return [2 /*return*/, imageUrl];
                    case 3:
                        error_4 = _a.sent();
                        logger_1.logger.error({
                            prompt: prompt.substring(0, 50),
                            error: error_4 instanceof Error ? error_4.message : String(error_4),
                        }, 'Image generation failed');
                        throw error_4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get model information
     */
    OpenAIHelper.prototype.getModelInfo = function () {
        return {
            textModel: this.textModel,
            imageModel: this.imageModel,
            provider: 'openai',
        };
    };
    return OpenAIHelper;
}());
exports.openaiHelper = new OpenAIHelper();
