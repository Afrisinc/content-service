"use strict";
/**
 * AI Agent Service
 * Handles communication with external SM AI Agent service
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAgentService = void 0;
var env_1 = require("@/config/env");
var logger_1 = require("@/utils/logger");
var axios_1 = require("axios");
var AIAgentService = /** @class */ (function () {
    function AIAgentService() {
        this.client = axios_1.default.create({
            baseURL: env_1.env.SM_AI_AGENT_URL,
            timeout: 60000,
        });
    }
    /**
     * Generate post using external AI Agent service
     */
    AIAgentService.prototype.generatePost = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var payload, response, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        payload = {
                            Topic: request.topic,
                            'Keywords or Hashtags (optional)': request.keywords || '',
                            'Link (optional)': request.link || '',
                            submittedAt: request.submittedAt || new Date().toISOString(),
                            formMode: request.formMode || 'production',
                        };
                        logger_1.logger.info({
                            topic: request.topic,
                            formMode: request.formMode,
                        }, 'Calling external AI Agent service');
                        return [4 /*yield*/, this.client.post('/sm-ai-agent', payload)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, {
                                success: true,
                                data: response.data,
                                message: 'Post generated successfully',
                            }];
                    case 2:
                        error_1 = _a.sent();
                        logger_1.logger.error({
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                            stack: error_1 instanceof Error ? error_1.stack : undefined,
                        }, 'Error calling AI Agent service');
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return AIAgentService;
}());
exports.aiAgentService = new AIAgentService();
