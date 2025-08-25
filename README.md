# Applied Mindfulness Platform

A comprehensive mindfulness application platform featuring AI-powered coaching, structured learning paths, and community features.

## Architecture Overview

- **Frontend**: React with TypeScript, Progressive Web App capabilities
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Redis caching
- **AI Integration**: Multi-provider LLM abstraction (Claude, GPT-4)
- **Infrastructure**: AWS (ECS, Aurora, S3, CloudFront)

## Core Modules

### 1. Mindfulness Instruction
- Structured learning paths mirroring "Meeting Your Mind Full" methodology
- Video/audio content with offline PWA capabilities
- Progress tracking and adaptive branching
- Instructor approval workflows

### 2. AI Coaching
- Personalized guidance through Claude Sonnet 4
- RAG-grounded responses with curriculum citations
- Multi-signal crisis detection with human escalation
- Conversation context management with intelligent summarization

### 3. Community Features
- Group formation (10-50 members)
- Progressive trust model with tiered verification
- AI-powered moderation with human review queues
- Calendar integration and video calls

## Quick Start

1. **Setup Environment**
   ```bash
   cp .env.example .env
   # Update .env with your configuration
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start Development**
   ```bash
   npm run dev
   ```

## Security Features

- Encryption at rest and in transit (TLS 1.3)
- Optional end-to-end encryption for private messages
- GDPR/CCPA compliance with regional data isolation
- HIPAA boundary management for licensed therapist sessions
- Comprehensive audit logging

## Development Phases

- **Phase 1**: Foundation infrastructure and authentication
- **Phase 2**: Content platform and learning system
- **Phase 3**: AI coaching with safety measures
- **Phase 4**: Community platform with moderation
- **Phase 5**: Mobile apps and production readiness

## Cost Projections

- **MVP (100-500 users)**: $800-1,200/month
- **Growth (1,000-5,000 users)**: $3,000-6,000/month
- **Scale (10,000-50,000 users)**: $10,000-20,000/month
- **Enterprise (100,000+ users)**: $20,000-35,000/month

## Commands

- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm run test` - Run test suite
- `npm run lint` - Lint code
- `npm run typecheck` - TypeScript checking
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with initial data

## Documentation

See the `Applied Mindfulness App Implementation Guide.md` for complete technical specifications, architecture decisions, and implementation details.

## License

Proprietary - Applied Mindfulness Training