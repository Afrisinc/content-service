"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// Entity schemas
__exportStar(require("./entities/user.schema"), exports);
// Request schemas
__exportStar(require("./requests/auth.schema"), exports);
__exportStar(require("./requests/user.schema"), exports);
__exportStar(require("./requests/socialMedia.schema"), exports);
__exportStar(require("./requests/aiGeneration.schema"), exports);
// Response schemas
__exportStar(require("./responses/auth.schema"), exports);
__exportStar(require("./responses/common.schema"), exports);
// Route schemas
__exportStar(require("./routes/auth.schema"), exports);
__exportStar(require("./routes/user.schema"), exports);
__exportStar(require("./routes/health.schema"), exports);
