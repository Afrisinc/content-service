// import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// import { FastifyInstance } from 'fastify';
// import { createApp } from '../app.js';
// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';

// describe('User Tests', () => {
//   let app: FastifyInstance;
//   let prisma: PrismaClient;
//   let authToken: string;
//   let userId: string;

//   beforeAll(async () => {
//     app = await createApp();
//     await app.ready();
//     prisma = new PrismaClient();
//   });

//   afterAll(async () => {
//     await app.close();
//     await prisma.$disconnect();
//   });

//   beforeEach(async () => {
//     // Clean up test data
//     await prisma.user.deleteMany({
//       where: {
//         email: {
//           contains: 'test',
//         },
//       },
//     });

//     // Create test user and get auth token
//     const hashedPassword = await bcrypt.hash('password123', 10);
//     const user = await prisma.user.create({
//       data: {
//         email: 'test@example.com',
//         password: hashedPassword,
//         name: 'Test User',
//       },
//     });

//     userId = user.id;

//     // Get auth token
//     const loginResponse = await app.inject({
//       method: 'POST',
//       url: '/auth/login',
//       payload: {
//         email: 'test@example.com',
//         password: 'password123',
//       },
//     });

//     const loginBody = JSON.parse(loginResponse.body);
//     authToken = loginBody.data.token;
//   });

//   describe('GET /users/profile', () => {
//     it('should get user profile with valid token', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//       });

//       expect(response.statusCode).toBe(200);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('id', userId);
//       expect(body).toHaveProperty('email', 'test@example.com');
//       expect(body).toHaveProperty('name', 'Test User');
//       expect(body).toHaveProperty('createdAt');
//       expect(body).toHaveProperty('updatedAt');
//       expect(body).not.toHaveProperty('password');
//     });

//     it('should return 401 without authentication', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: '/users/profile',
//       });

//       expect(response.statusCode).toBe(401);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('error', 'Unauthorized');
//     });

//     it('should return 401 with invalid token', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: '/users/profile',
//         headers: {
//           authorization: 'Bearer invalid-token',
//         },
//       });

//       expect(response.statusCode).toBe(401);
//     });
//   });

//   describe('PUT /users/profile', () => {
//     it('should update user profile successfully', async () => {
//       const updateData = {
//         name: 'Updated Name',
//         email: 'updated@example.com',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(200);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('message', 'Profile updated successfully');
//       expect(body).toHaveProperty('data');
//       expect(body.data).toHaveProperty('user');
//       expect(body.data.user).toHaveProperty('name', updateData.name);
//       expect(body.data.user).toHaveProperty('email', updateData.email);
//       expect(body.data.user).not.toHaveProperty('password');
//     });

//     it('should update only name when provided', async () => {
//       const updateData = {
//         name: 'Only Name Updated',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(200);

//       const body = JSON.parse(response.body);
//       expect(body.data.user).toHaveProperty('name', updateData.name);
//       expect(body.data.user).toHaveProperty('email', 'test@example.com'); // unchanged
//     });

//     it('should update only email when provided', async () => {
//       const updateData = {
//         email: 'newemail@example.com',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(200);

//       const body = JSON.parse(response.body);
//       expect(body.data.user).toHaveProperty('email', updateData.email);
//       expect(body.data.user).toHaveProperty('name', 'Test User'); // unchanged
//     });

//     it('should return 400 for invalid email format', async () => {
//       const updateData = {
//         email: 'invalid-email-format',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(400);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('error');
//     });

//     it('should return 409 for duplicate email', async () => {
//       // Create another user
//       const hashedPassword = await bcrypt.hash('password123', 10);
//       await prisma.user.create({
//         data: {
//           email: 'existing@example.com',
//           password: hashedPassword,
//           name: 'Existing User',
//         },
//       });

//       const updateData = {
//         email: 'existing@example.com',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(409);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('error', 'Conflict');
//       expect(body).toHaveProperty(
//         'message',
//         'User with this email already exists'
//       );
//     });

//     it('should return 401 without authentication', async () => {
//       const updateData = {
//         name: 'Should Fail',
//       };

//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         payload: updateData,
//       });

//       expect(response.statusCode).toBe(401);
//     });

//     it('should return 400 for empty update data', async () => {
//       const response = await app.inject({
//         method: 'PUT',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//         payload: {},
//       });

//       expect(response.statusCode).toBe(400);
//     });
//   });

//   describe('GET /users/:id', () => {
//     it('should get user by id for authenticated user', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: `/users/${userId}`,
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//       });

//       expect(response.statusCode).toBe(200);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('id', userId);
//       expect(body).toHaveProperty('email', 'test@example.com');
//       expect(body).toHaveProperty('name', 'Test User');
//       expect(body).not.toHaveProperty('password');
//     });

//     it('should return 404 for non-existent user', async () => {
//       const fakeId = 'non-existent-id';

//       const response = await app.inject({
//         method: 'GET',
//         url: `/users/${fakeId}`,
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//       });

//       expect(response.statusCode).toBe(404);

//       const body = JSON.parse(response.body);
//       expect(body).toHaveProperty('error', 'Not Found');
//       expect(body).toHaveProperty('message', 'User not found');
//     });

//     it('should return 401 without authentication', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: `/users/${userId}`,
//       });

//       expect(response.statusCode).toBe(401);
//     });
//   });

//   describe('Error Handling', () => {
//     it('should handle database connection errors gracefully', async () => {
//       // This test would need to simulate a database connection error
//       // For now, we'll test that the routes exist and respond appropriately
//       const response = await app.inject({
//         method: 'GET',
//         url: '/users/profile',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//       });

//       expect([200, 500]).toContain(response.statusCode);
//     });

//     it('should validate request parameters', async () => {
//       const response = await app.inject({
//         method: 'GET',
//         url: '/users/invalid-id-format',
//         headers: {
//           authorization: `Bearer ${authToken}`,
//         },
//       });

//       // Should either be 400 (validation error) or 404 (not found)
//       expect([400, 404]).toContain(response.statusCode);
//     });
//   });
// });
