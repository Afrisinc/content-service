import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '@/app.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

describe('Authentication Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message', 'User registered successfully');
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('user');
      expect(body.data.user).toHaveProperty('id');
      expect(body.data.user).toHaveProperty('email', userData.email);
      expect(body.data.user).toHaveProperty('name', userData.name);
      expect(body.data.user).not.toHaveProperty('password');
    });

    it('should return 400 for invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return 400 for short password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        name: 'Test User',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return 409 for duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      // Register first user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      // Try to register with same email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(409);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Conflict');
      expect(body).toHaveProperty(
        'message',
        'User with this email already exists'
      );
    });

    it('should require all fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create test user
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          name: 'Test User',
        },
      });
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message', 'Login successful');
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('token');
      expect(body.data).toHaveProperty('user');
      expect(body.data.user).toHaveProperty('email', loginData.email);
      expect(body.data.user).not.toHaveProperty('password');

      // Verify JWT token format
      expect(body.data.token).toMatch(
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/
      );
    });

    it('should return 401 for invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData,
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 401 for invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData,
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 400 for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          // missing password
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginData,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Authentication Middleware', () => {
    let authToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create test user and get auth token
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: userData,
      });

      const registerBody = JSON.parse(registerResponse.body);
      userId = registerBody.data.user.id;

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: userData.email,
          password: userData.password,
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      authToken = loginBody.data.token;
    });

    it('should access protected route with valid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id', userId);
      expect(body).toHaveProperty('email', 'test@example.com');
      expect(body).not.toHaveProperty('password');
    });

    it('should reject request without authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty(
        'message',
        'Authorization header is required'
      );
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message', 'Invalid token');
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/profile',
        headers: {
          authorization: 'Invalid-Format',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
