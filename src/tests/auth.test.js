"use strict";
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
var vitest_1 = require("vitest");
var app_js_1 = require("@/app.js");
var client_1 = require("@prisma/client");
var bcryptjs_1 = require("bcryptjs");
(0, vitest_1.describe)('Authentication Tests', function () {
    var app;
    var prisma;
    (0, vitest_1.beforeAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, app_js_1.createApp)()];
                case 1:
                    app = _a.sent();
                    return [4 /*yield*/, app.ready()];
                case 2:
                    _a.sent();
                    prisma = new client_1.PrismaClient();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.afterAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.close()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, prisma.$disconnect()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Clean up test data
                return [4 /*yield*/, prisma.user.deleteMany({
                        where: {
                            email: {
                                contains: 'test',
                            },
                        },
                    })];
                case 1:
                    // Clean up test data
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.describe)('POST /auth/register', function () {
        (0, vitest_1.it)('should register a new user successfully', function () { return __awaiter(void 0, void 0, void 0, function () {
            var userData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userData = {
                            email: 'test@example.com',
                            password: 'password123',
                            name: 'Test User',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(201);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'User registered successfully');
                        (0, vitest_1.expect)(body).toHaveProperty('data');
                        (0, vitest_1.expect)(body.data).toHaveProperty('user');
                        (0, vitest_1.expect)(body.data.user).toHaveProperty('id');
                        (0, vitest_1.expect)(body.data.user).toHaveProperty('email', userData.email);
                        (0, vitest_1.expect)(body.data.user).toHaveProperty('name', userData.name);
                        (0, vitest_1.expect)(body.data.user).not.toHaveProperty('password');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 400 for invalid email format', function () { return __awaiter(void 0, void 0, void 0, function () {
            var userData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userData = {
                            email: 'invalid-email',
                            password: 'password123',
                            name: 'Test User',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(400);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 400 for short password', function () { return __awaiter(void 0, void 0, void 0, function () {
            var userData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userData = {
                            email: 'test@example.com',
                            password: '123',
                            name: 'Test User',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(400);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 409 for duplicate email', function () { return __awaiter(void 0, void 0, void 0, function () {
            var userData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userData = {
                            email: 'test@example.com',
                            password: 'password123',
                            name: 'Test User',
                        };
                        // Register first user
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 1:
                        // Register first user
                        _a.sent();
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 2:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(409);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error', 'Conflict');
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'User with this email already exists');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should require all fields', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'POST',
                            url: '/auth/register',
                            payload: {},
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(400);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('POST /auth/login', function () {
        (0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
            var hashedPassword;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, bcryptjs_1.default.hash('password123', 10)];
                    case 1:
                        hashedPassword = _a.sent();
                        return [4 /*yield*/, prisma.user.create({
                                data: {
                                    email: 'test@example.com',
                                    password: hashedPassword,
                                    name: 'Test User',
                                },
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should login with valid credentials', function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        loginData = {
                            email: 'test@example.com',
                            password: 'password123',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/login',
                                payload: loginData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(200);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'Login successful');
                        (0, vitest_1.expect)(body).toHaveProperty('data');
                        (0, vitest_1.expect)(body.data).toHaveProperty('token');
                        (0, vitest_1.expect)(body.data).toHaveProperty('user');
                        (0, vitest_1.expect)(body.data.user).toHaveProperty('email', loginData.email);
                        (0, vitest_1.expect)(body.data.user).not.toHaveProperty('password');
                        // Verify JWT token format
                        (0, vitest_1.expect)(body.data.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 401 for invalid email', function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        loginData = {
                            email: 'nonexistent@example.com',
                            password: 'password123',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/login',
                                payload: loginData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(401);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error', 'Unauthorized');
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'Invalid credentials');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 401 for invalid password', function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginData, response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        loginData = {
                            email: 'test@example.com',
                            password: 'wrongpassword',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/login',
                                payload: loginData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(401);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error', 'Unauthorized');
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'Invalid credentials');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 400 for missing fields', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'POST',
                            url: '/auth/login',
                            payload: {
                                email: 'test@example.com',
                                // missing password
                            },
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(400);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should return 400 for invalid email format', function () { return __awaiter(void 0, void 0, void 0, function () {
            var loginData, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        loginData = {
                            email: 'invalid-email',
                            password: 'password123',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/login',
                                payload: loginData,
                            })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(400);
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('Authentication Middleware', function () {
        var authToken;
        var userId;
        (0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
            var userData, registerResponse, registerBody, loginResponse, loginBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userData = {
                            email: 'test@example.com',
                            password: 'password123',
                            name: 'Test User',
                        };
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/register',
                                payload: userData,
                            })];
                    case 1:
                        registerResponse = _a.sent();
                        registerBody = JSON.parse(registerResponse.body);
                        userId = registerBody.data.user.id;
                        return [4 /*yield*/, app.inject({
                                method: 'POST',
                                url: '/auth/login',
                                payload: {
                                    email: userData.email,
                                    password: userData.password,
                                },
                            })];
                    case 2:
                        loginResponse = _a.sent();
                        loginBody = JSON.parse(loginResponse.body);
                        authToken = loginBody.data.token;
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should access protected route with valid token', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'GET',
                            url: '/users/profile',
                            headers: {
                                authorization: "Bearer ".concat(authToken),
                            },
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(200);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('id', userId);
                        (0, vitest_1.expect)(body).toHaveProperty('email', 'test@example.com');
                        (0, vitest_1.expect)(body).not.toHaveProperty('password');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should reject request without authorization header', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'GET',
                            url: '/users/profile',
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(401);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error', 'Unauthorized');
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'Authorization header is required');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should reject request with invalid token', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response, body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'GET',
                            url: '/users/profile',
                            headers: {
                                authorization: 'Bearer invalid-token',
                            },
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(401);
                        body = JSON.parse(response.body);
                        (0, vitest_1.expect)(body).toHaveProperty('error', 'Unauthorized');
                        (0, vitest_1.expect)(body).toHaveProperty('message', 'Invalid token');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('should reject request with malformed authorization header', function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, app.inject({
                            method: 'GET',
                            url: '/users/profile',
                            headers: {
                                authorization: 'Invalid-Format',
                            },
                        })];
                    case 1:
                        response = _a.sent();
                        (0, vitest_1.expect)(response.statusCode).toBe(401);
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
