"use strict";
/**
 * Database Seed Script
 * Creates test data for development and testing
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
var client_1 = require("@prisma/client");
var bcryptjs_1 = require("bcryptjs");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var hashedPassword, testUser1, testUser2, testUser3, facebookAccount1, instagramAccount1, facebookAccount2, post1, post2, post3, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 19, 20, 22]);
                    console.log('Starting database seed...\n');
                    // ============================================
                    // 1. Create Test Users
                    // ============================================
                    console.log('Creating test users...');
                    return [4 /*yield*/, bcryptjs_1.default.hash('testpassword123', 10)];
                case 1:
                    hashedPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'alice@example.com' },
                            update: {},
                            create: {
                                email: 'alice@example.com',
                                password: hashedPassword,
                                name: 'Alice Johnson',
                            },
                        })];
                case 2:
                    testUser1 = _a.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'bob@example.com' },
                            update: {},
                            create: {
                                email: 'bob@example.com',
                                password: hashedPassword,
                                name: 'Bob Smith',
                            },
                        })];
                case 3:
                    testUser2 = _a.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'charlie@example.com' },
                            update: {},
                            create: {
                                email: 'charlie@example.com',
                                password: hashedPassword,
                                name: 'Charlie Brown',
                            },
                        })];
                case 4:
                    testUser3 = _a.sent();
                    console.log('Created 3 test users');
                    console.log("   - ".concat(testUser1.email, " (").concat(testUser1.name, ")"));
                    console.log("   - ".concat(testUser2.email, " (").concat(testUser2.name, ")"));
                    console.log("   - ".concat(testUser3.email, " (").concat(testUser3.name, ")\n"));
                    // ============================================
                    // 2. Create Social Media Accounts
                    // ============================================
                    console.log('Creating social media accounts...');
                    return [4 /*yield*/, prisma.socialMediaAccount.upsert({
                            where: {
                                userId_platform_pageId: {
                                    userId: testUser1.id,
                                    platform: 'facebook',
                                    pageId: '123456789',
                                },
                            },
                            update: {},
                            create: {
                                userId: testUser1.id,
                                platform: 'facebook',
                                pageId: '123456789',
                                pageeName: 'Alice Business Page',
                                accessToken: 'EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA',
                                refreshToken: 'EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA_refresh',
                                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                                isActive: true,
                            },
                        })];
                case 5:
                    facebookAccount1 = _a.sent();
                    return [4 /*yield*/, prisma.socialMediaAccount.upsert({
                            where: {
                                userId_platform_pageId: {
                                    userId: testUser1.id,
                                    platform: 'instagram',
                                    pageId: '987654321',
                                },
                            },
                            update: {},
                            create: {
                                userId: testUser1.id,
                                platform: 'instagram',
                                pageId: '987654321',
                                pageeName: 'Alice_Business_IG',
                                accessToken: 'IGQVJYNUszREY1ZBX2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA',
                                isActive: true,
                            },
                        })];
                case 6:
                    instagramAccount1 = _a.sent();
                    return [4 /*yield*/, prisma.socialMediaAccount.upsert({
                            where: {
                                userId_platform_pageId: {
                                    userId: testUser2.id,
                                    platform: 'facebook',
                                    pageId: '555666777',
                                },
                            },
                            update: {},
                            create: {
                                userId: testUser2.id,
                                platform: 'facebook',
                                pageId: '555666777',
                                pageeName: "Bob's Company",
                                accessToken: 'EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA_bob',
                                isActive: true,
                            },
                        })];
                case 7:
                    facebookAccount2 = _a.sent();
                    console.log('Created 3 social media accounts');
                    console.log("   - Facebook: ".concat(facebookAccount1.pageeName));
                    console.log("   - Instagram: ".concat(instagramAccount1.pageeName));
                    console.log("   - Facebook: ".concat(facebookAccount2.pageeName, "\n"));
                    // ============================================
                    // 3. Create Social Media Posts
                    // ============================================
                    console.log('Creating social media posts...');
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser1.id,
                                platform: 'facebook',
                                pageId: '123456789',
                                postId: 'facebook_post_1',
                                postUrl: 'https://facebook.com/123456789/posts/facebook_post_1',
                                message: 'Excited to announce our new product launch!',
                                link: 'https://example.com/new-product',
                                description: 'Check out our latest innovation',
                                picture: 'https://example.com/product-image.jpg',
                                name: 'New Product Launch',
                                caption: 'Revolutionary technology',
                                tags: ['#innovation', '#productlaunch', '#technology'],
                                mediaType: 'image',
                                mediaUrls: ['https://example.com/product-image.jpg'],
                                altText: 'New product showcase',
                                status: 'published',
                                publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                                likes: 145,
                                comments: 23,
                                shares: 12,
                                views: 2850,
                                lastMetricsUpdate: new Date(Date.now() - 1 * 60 * 60 * 1000),
                                metadata: JSON.stringify({
                                    source: 'manual',
                                    campaign: 'product-launch-2024',
                                }),
                            },
                        })];
                case 8:
                    post1 = _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser1.id,
                                platform: 'facebook',
                                pageId: '123456789',
                                postId: 'facebook_post_2',
                                postUrl: 'https://facebook.com/123456789/posts/facebook_post_2',
                                message: 'Join us for a live Q&A session tomorrow at 2 PM EST! Ask our team anything about our latest features.',
                                link: 'https://example.com/live-qa',
                                status: 'published',
                                publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                                aiGenerated: true,
                                aiProvider: 'openai',
                                aiModel: 'gpt-4',
                                aiPrompt: 'Write an engaging post about a Q&A session',
                                likes: 87,
                                comments: 34,
                                shares: 5,
                                views: 1234,
                                lastMetricsUpdate: new Date(Date.now() - 2 * 60 * 60 * 1000),
                                metadata: JSON.stringify({
                                    aiGenerated: true,
                                    generatedBy: 'openai',
                                    generationPrompt: 'Write an engaging post about a Q&A session',
                                }),
                            },
                        })];
                case 9:
                    post2 = _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser1.id,
                                platform: 'instagram',
                                pageId: '987654321',
                                postId: 'instagram_post_1',
                                postUrl: 'https://instagram.com/p/instagram_post_1',
                                message: 'Beautiful sunset with our team!',
                                caption: 'Team celebration at the beach',
                                tags: ['#teamwork', '#sunset', '#celebration'],
                                mediaType: 'image',
                                mediaUrls: ['https://example.com/sunset-team.jpg'],
                                altText: 'Team members at sunset',
                                status: 'published',
                                publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                                likes: 342,
                                comments: 56,
                                shares: 0,
                                views: 5678,
                                lastMetricsUpdate: new Date(),
                                metadata: JSON.stringify({
                                    platform: 'instagram',
                                    source: 'team-event',
                                }),
                            },
                        })];
                case 10:
                    post3 = _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser1.id,
                                platform: 'facebook',
                                pageId: '123456789',
                                message: 'This post will be published tomorrow!',
                                scheduledAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                                status: 'pending',
                                metadata: JSON.stringify({
                                    type: 'scheduled',
                                    scheduledTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
                                }),
                            },
                        })];
                case 11:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser1.id,
                                platform: 'facebook',
                                pageId: '123456789',
                                message: 'This post failed to publish',
                                status: 'failed',
                                errorMessage: 'Invalid access token or page permissions',
                                metadata: JSON.stringify({
                                    errorCode: 190,
                                    errorType: 'OAuthException',
                                }),
                            },
                        })];
                case 12:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser2.id,
                                platform: 'facebook',
                                pageId: '555666777',
                                postId: 'facebook_post_bob_1',
                                postUrl: 'https://facebook.com/555666777/posts/facebook_post_bob_1',
                                message: 'Congratulations to our team for winning the innovation award!',
                                link: 'https://example.com/award-announcement',
                                status: 'published',
                                publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                                likes: 234,
                                comments: 45,
                                shares: 18,
                                views: 4500,
                                lastMetricsUpdate: new Date(Date.now() - 30 * 60 * 1000),
                            },
                        })];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser2.id,
                                platform: 'facebook',
                                pageId: '555666777',
                                message: 'Check out our latest blog post about sustainable practices!',
                                link: 'https://example.com/blog/sustainability',
                                description: 'Learn how we are committed to environmental responsibility',
                                status: 'published',
                                publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                                aiGenerated: true,
                                aiProvider: 'anthropic',
                                aiModel: 'claude-3-opus',
                                aiPrompt: 'Write a post about our sustainability initiatives',
                                likes: 98,
                                comments: 12,
                                shares: 8,
                                views: 1800,
                                lastMetricsUpdate: new Date(Date.now() - 4 * 60 * 60 * 1000),
                            },
                        })];
                case 14:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaPost.create({
                            data: {
                                userId: testUser3.id,
                                platform: 'facebook',
                                pageId: '999000111',
                                message: 'Just sharing some thoughts for the day',
                                status: 'published',
                                publishedAt: new Date(),
                                likes: 5,
                                comments: 1,
                                shares: 0,
                                views: 120,
                            },
                        })];
                case 15:
                    _a.sent();
                    console.log('Created 7 social media posts');
                    console.log('   - 3 published posts (Alice: 2 Facebook, 1 Instagram)');
                    console.log('   - 1 scheduled post');
                    console.log('   - 1 failed post');
                    console.log('   - 2 posts for Bob (published, AI-generated)');
                    console.log('   - 1 post for Charlie\n');
                    // ============================================
                    // 4. Create Social Media Analytics
                    // ============================================
                    console.log('Creating analytics records...');
                    return [4 /*yield*/, prisma.socialMediaAnalytics.upsert({
                            where: { postId: post1.id },
                            update: {},
                            create: {
                                postId: post1.id,
                                date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                                platform: 'facebook',
                                impressions: 3200,
                                reaches: 2850,
                                engagements: 180,
                                clicks: 45,
                                likes: 145,
                                comments: 23,
                                shares: 12,
                                saves: 8,
                                views: 2850,
                                topCountries: ['US', 'CA', 'UK'],
                                topCities: ['San Francisco', 'Toronto', 'London'],
                                genderBreakdown: ['M: 55%', 'F: 45%'],
                                ageBreakdown: ['25-34: 35%', '35-44: 30%', '45-54: 20%', '55+: 15%'],
                            },
                        })];
                case 16:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaAnalytics.upsert({
                            where: { postId: post2.id },
                            update: {},
                            create: {
                                postId: post2.id,
                                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                                platform: 'facebook',
                                impressions: 1500,
                                reaches: 1234,
                                engagements: 126,
                                clicks: 34,
                                likes: 87,
                                comments: 34,
                                shares: 5,
                                saves: 3,
                                views: 1234,
                                topCountries: ['US', 'UK'],
                                topCities: ['New York', 'London'],
                            },
                        })];
                case 17:
                    _a.sent();
                    return [4 /*yield*/, prisma.socialMediaAnalytics.upsert({
                            where: { postId: post3.id },
                            update: {},
                            create: {
                                postId: post3.id,
                                date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                                platform: 'instagram',
                                impressions: 6200,
                                reaches: 5678,
                                engagements: 398,
                                clicks: 120,
                                likes: 342,
                                comments: 56,
                                shares: 0,
                                saves: 45,
                                views: 5678,
                                topCountries: ['US', 'CA', 'AU'],
                            },
                        })];
                case 18:
                    _a.sent();
                    console.log('Created 3 analytics records\n');
                    // ============================================
                    // 5. Summary
                    // ============================================
                    console.log('========================================');
                    console.log('Database seeding completed successfully!\n');
                    console.log('Summary:');
                    console.log('   - 3 test users created');
                    console.log('   - 3 social media accounts created');
                    console.log('   - 7 social media posts created');
                    console.log('   - 3 analytics records created\n');
                    console.log('Test Credentials:');
                    console.log('   User 1: alice@example.com / testpassword123');
                    console.log('   User 2: bob@example.com / testpassword123');
                    console.log('   User 3: charlie@example.com / testpassword123\n');
                    console.log('Next Steps:');
                    console.log('   1. Run: npm run dev');
                    console.log('   2. Open: http://localhost:3000/docs');
                    console.log('   3. Test the API endpoints\n');
                    console.log('Facebook Test Tokens (for testing):');
                    console.log('   Account 1 (Alice): EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA');
                    console.log('   Account 2 (Bob): EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA_bob\n');
                    console.log('Test Data Details:');
                    console.log('   - Published posts with various engagement metrics');
                    console.log('   - Scheduled post (set for tomorrow)');
                    console.log('   - Failed post example');
                    console.log('   - AI-generated post examples (OpenAI, Anthropic)');
                    console.log('   - Analytics data with demographic breakdowns\n');
                    console.log('Ready to test! Happy coding!\n');
                    return [3 /*break*/, 22];
                case 19:
                    error_1 = _a.sent();
                    console.error('Error seeding database:', error_1);
                    throw error_1;
                case 20: return [4 /*yield*/, prisma.$disconnect()];
                case 21:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 22: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (error) {
    console.error(error);
    process.exit(1);
});
