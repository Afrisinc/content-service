"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.success = void 0;
var success = function (reply, code, message, data) {
    return reply.status(code).send({ success: true, message: message, data: data });
};
exports.success = success;
var error = function (reply, code, message) {
    return reply.status(code).send({ success: false, message: message });
};
exports.error = error;
