# Backend Template - Node.js

A professional, production-ready Node.js backend template built with Fastify, TypeScript, Prisma, and PostgreSQL.

## Features

- **Modern Tech Stack**: Node.js 20, TypeScript, Fastify, Prisma ORM
- **Database**: PostgreSQL with Prisma ORM and migrations
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **API Documentation**: Swagger/OpenAPI integration with auto-generated docs
- **Validation**: Request/response validation with Zod schemas
- **Logging**: Structured logging with Pino (JSON in production, pretty in development)
- **Testing**: Comprehensive test suite with Vitest
- **Code Quality**: ESLint, Prettier, Husky pre-commit hooks, lint-staged
- **Docker**: Multi-stage Dockerfile with security best practices
- **Docker Compose**: PostgreSQL + pgAdmin setup for development
- **CI/CD**: GitHub Actions workflow for testing and deployment
- **Health Checks**: Built-in health check endpoints with metrics
- **Error Handling**: Centralized error handling with proper HTTP status codes
- **Security**: Non-root Docker user, input validation, JWT token security

## 📋 Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Git

## 🛠️ Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd backend-template-nodejs
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:

```env
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/backend_template?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3000
LOG_LEVEL=debug
NODE_ENV=development
```

### 3. Start Database

```bash
# Start PostgreSQL and pgAdmin
docker-compose up -d

# Access pgAdmin at http://localhost:5050
# Email: admin@admin.com
# Password: admin123
```

### 4. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed
```

### 5. Development

```bash
# Start development server
npm run dev

# Server will start at http://localhost:3000
# API docs available at http://localhost:3000/docs
```

## 📚 Available Scripts

### Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server

### Testing

- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Code Quality

- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript type checking
- `npm run check-all` - Run all checks (type, lint, format)
- `npm run fix-all` - Fix all auto-fixable issues

### Database

- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data

## 🏗️ Project Structure

```
src/
├── controllers/     # Route handlers and business logic
├── middlewares/     # Custom middleware (auth, validation, etc.)
├── repositories/    # Database access layer
├── routes/          # API route definitions
├── schemas/         # Zod validation schemas
├── services/        # Business logic services
├── tests/           # Test files
├── utils/           # Utility functions and helpers
├── app.ts           # Fastify app configuration
└── server.ts        # Server entry point

prisma/
├── migrations/      # Database migrations
├── schema.prisma    # Database schema definition
└── seed.ts          # Database seeding script
```

## 🔒 Authentication

### Register User

```bash
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### Login

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Protected Routes

Include JWT token in Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

## 📊 API Documentation

Interactive API documentation is available at:

- Development: http://localhost:3000/docs
- Production: https://your-domain.com/docs

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test auth.test.ts

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

Test files are located in `src/tests/` and follow the naming convention `*.test.ts`.

## 🐳 Docker

### Development with Docker Compose

```bash
# Start all services (app, postgres, pgadmin)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Docker Build

```bash
# Build production image
docker build -t backend-template .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="your-production-db-url" \
  -e JWT_SECRET="your-production-secret" \
  backend-template
```

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
DATABASE_URL=your-production-database-url
JWT_SECRET=your-strong-production-secret
PORT=3000
LOG_LEVEL=info
```

### Database Migrations in Production

```bash
# Run migrations
npx prisma migrate deploy

# Generate client
npx prisma generate
```

### Health Checks

The application includes health check endpoints:

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with database connectivity

## 📈 Monitoring and Logging

### Logging

- **Development**: Pretty-printed logs with colors
- **Production**: Structured JSON logs with request tracing
- **Log Levels**: fatal, error, warn, info, debug, trace

### Health Monitoring

- Basic health endpoint for load balancers
- Database connectivity checks
- Memory and CPU usage metrics
- Request/response time tracking

## 🔧 Configuration

### Database Connection Pooling

Prisma automatically handles connection pooling. Configure in `schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### CORS Configuration

CORS is configured in `src/app.ts`. Modify for your domain:

```typescript
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
});
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Workflow

1. All commits are automatically linted and formatted via Husky pre-commit hooks
2. Tests must pass before merging
3. Follow conventional commit message format
4. Update documentation for API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Database Connection Issues**

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check database logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d
npm run db:migrate
```

**TypeScript Compilation Errors**

```bash
# Clean build
rm -rf dist/
npm run build

# Check types
npm run type-check
```

**Test Failures**

```bash
# Run tests with verbose output
npm test -- --reporter=verbose

# Run specific test
npm test -- auth.test.ts
```

### Performance Optimization

1. **Database**: Use connection pooling and optimize queries
2. **Caching**: Implement Redis for frequently accessed data
3. **Monitoring**: Add APM tools like New Relic or DataDog
4. **Load Balancing**: Use nginx or cloud load balancers
5. **CDN**: Serve static assets via CDN

## 📞 Support

For questions or issues:

1. Check the [documentation](./docs/)
2. Search [existing issues](../../issues)
3. Create a [new issue](../../issues/new)

---

Built with ❤️ using Node.js, TypeScript, and Fastify
