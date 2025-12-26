/**
 * Database Seed Script
 * Creates test data for development and testing
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Starting database seed...\n');

    // ============================================
    // 1. Create Test Users
    // ============================================
    console.log('Creating test users...');

    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const testUser1 = await prisma.user.upsert({
      where: { email: 'alice@example.com' },
      update: {},
      create: {
        email: 'alice@example.com',
        password: hashedPassword,
        name: 'Alice Johnson',
      },
    });

    const testUser2 = await prisma.user.upsert({
      where: { email: 'bob@example.com' },
      update: {},
      create: {
        email: 'bob@example.com',
        password: hashedPassword,
        name: 'Bob Smith',
      },
    });

    const testUser3 = await prisma.user.upsert({
      where: { email: 'charlie@example.com' },
      update: {},
      create: {
        email: 'charlie@example.com',
        password: hashedPassword,
        name: 'Charlie Brown',
      },
    });

    console.log('Created 3 test users');
    console.log(`   - ${testUser1.email} (${testUser1.name})`);
    console.log(`   - ${testUser2.email} (${testUser2.name})`);
    console.log(`   - ${testUser3.email} (${testUser3.name})\n`);

    // ============================================
    // 2. Create Social Media Accounts
    // ============================================
    console.log('Creating social media accounts...');

    const facebookAccount1 = await prisma.socialMediaAccount.upsert({
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
        refreshToken:
          'EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA_refresh',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    const instagramAccount1 = await prisma.socialMediaAccount.upsert({
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
    });

    const facebookAccount2 = await prisma.socialMediaAccount.upsert({
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
    });

    console.log('Created 3 social media accounts');
    console.log(`   - Facebook: ${facebookAccount1.pageeName}`);
    console.log(`   - Instagram: ${instagramAccount1.pageeName}`);
    console.log(`   - Facebook: ${facebookAccount2.pageeName}\n`);

    // ============================================
    // 3. Create Social Media Posts
    // ============================================
    console.log('Creating social media posts...');

    const post1 = await prisma.socialMediaPost.create({
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
    });

    const post2 = await prisma.socialMediaPost.create({
      data: {
        userId: testUser1.id,
        platform: 'facebook',
        pageId: '123456789',
        postId: 'facebook_post_2',
        postUrl: 'https://facebook.com/123456789/posts/facebook_post_2',
        message:
          'Join us for a live Q&A session tomorrow at 2 PM EST! Ask our team anything about our latest features.',
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
    });

    const post3 = await prisma.socialMediaPost.create({
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
    });

    await prisma.socialMediaPost.create({
      data: {
        userId: testUser1.id,
        platform: 'facebook',
        pageId: '123456789',
        message: 'This post will be published tomorrow!',
        scheduledAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        status: 'pending',
        metadata: JSON.stringify({
          type: 'scheduled',
          scheduledTime: new Date(
            Date.now() + 1 * 24 * 60 * 60 * 1000
          ).toISOString(),
        }),
      },
    });

    await prisma.socialMediaPost.create({
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
    });

    await prisma.socialMediaPost.create({
      data: {
        userId: testUser2.id,
        platform: 'facebook',
        pageId: '555666777',
        postId: 'facebook_post_bob_1',
        postUrl: 'https://facebook.com/555666777/posts/facebook_post_bob_1',
        message:
          'Congratulations to our team for winning the innovation award!',
        link: 'https://example.com/award-announcement',
        status: 'published',
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        likes: 234,
        comments: 45,
        shares: 18,
        views: 4500,
        lastMetricsUpdate: new Date(Date.now() - 30 * 60 * 1000),
      },
    });

    await prisma.socialMediaPost.create({
      data: {
        userId: testUser2.id,
        platform: 'facebook',
        pageId: '555666777',
        message: 'Check out our latest blog post about sustainable practices!',
        link: 'https://example.com/blog/sustainability',
        description:
          'Learn how we are committed to environmental responsibility',
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
    });

    await prisma.socialMediaPost.create({
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
    });

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

    await prisma.socialMediaAnalytics.upsert({
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
    });

    await prisma.socialMediaAnalytics.upsert({
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
    });

    await prisma.socialMediaAnalytics.upsert({
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
    });

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
    console.log(
      '   Account 1 (Alice): EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA'
    );
    console.log(
      '   Account 2 (Bob): EAAB2N7ZBX1sBAHgT9N2ZCN5lXzqZCZBmZAbQhCrO5Eo5T2ZA_bob\n'
    );

    console.log('Test Data Details:');
    console.log('   - Published posts with various engagement metrics');
    console.log('   - Scheduled post (set for tomorrow)');
    console.log('   - Failed post example');
    console.log('   - AI-generated post examples (OpenAI, Anthropic)');
    console.log('   - Analytics data with demographic breakdowns\n');

    console.log('Ready to test! Happy coding!\n');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
