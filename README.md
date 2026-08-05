# Wajibet

Wajibet is an education and school operations platform designed for public-school ecosystems. It combines school administration, student and teacher workflows, gamified learning, live classroom sessions, analytics, finance, and digital content delivery in a single product.

At a high level, Wajibet helps schools manage:

- school and user onboarding
- teacher, student, admin, and manager role-based dashboards
- assignments, attendance, enrollments, and classroom resources
- gamified learning experiences and game result tracking
- live hosted sessions with real-time multiplayer or classroom coordination
- 3D / virtual model viewing, virtual labs, and educational assets
- school landing pages, documents, payments, and finance summaries

## What the platform does

Wajibet is not just a frontend portal. It is a multi-role educational operating system for schools, with a strong focus on:

1. School management
   - school profile and school document management
   - user and role management
   - public school presentation pages

2. Learning and gamification
   - game templates and game creation flows
   - leaderboard and result tracking
   - live session hosting and player lobby experiences

3. Real-time engagement
   - Socket.IO-powered host/player communication
   - live session state, room coordination, and lobby flow

4. Analytics and operations
   - platform reports, performance dashboards, and finance views
   - institutional data aggregation for students, classes, and schools

## Architecture overview

The repository is organized as a monorepo with two major runtime areas:

- `client/` — React + Vite frontend
- `server/` — Express.js + MongoDB + Socket.IO backend

### Runtime architecture

```text
Browser / User
  │
  ▼
React client (Vite)
  │    HTTPS REST API + WebSocket
  ▼
Express API server
  │
  ├─ Auth middleware / permissions
  ├─ Controllers for school, users, finance, games, classes, analytics
  ├─ Mongoose models for MongoDB persistence
  └─ Socket.IO live-session real-time handler
  │
  ▼
MongoDB
```

### Application layers

- Frontend layer
  - React 19
  - Vite
  - React Router
  - Tailwind CSS
  - 3D viewer support with Three.js
  - Socket.IO client integration for live play flows

- Backend layer
  - Express.js
  - Mongoose ODM
  - JWT-based authentication
  - Route-based permission and authorization checks
  - controllers/services for domain operations

- Realtime layer
  - Socket.IO server and client
  - live games, lobbies, host/player coordination, session state tracking

- Data layer
  - MongoDB for schools, users, classes, assignments, game templates, results, finance, and analytics

## Repository structure

```text
client/                  # React frontend
  src/                   # application pages, dashboards, layouts, contexts, services
  public/                # static assets, icons, models, and landing assets
  package.json           # client dependencies and scripts

server/                  # Express backend
  app.js                 # Express app configuration and route wiring
  server.js              # HTTP server + Socket.IO bootstrapping
  controllers/           # business logic by domain
  models/                # MongoDB schema definitions
  routes/                # REST API route registration
  middleware/            # auth, permissions, uploads, validation
  services/              # finance, enrollment, reporting, logging, and workflow services
  socket/                # real-time game/session event handlers
  config/                # DB and migration utilities

EDZ-ARCHITECTURE-CONTEXT.md
  # cross-platform architecture notes and integration context
```

## Key platform capabilities

### Student and teacher flows
- classroom dashboards
- assignments and resources
- game creation, editing, and play flows
- leaderboards and result analysis

### Manager and admin flows
- school governance and page builder tools
- finance and payment data views
- administration panels and analytics

### Public-facing components
- public landing pages
- public school pages
- educational content and model viewing

## Technology stack

### Frontend
- React 19
- Vite
- React Router
- Tailwind CSS
- Chart.js / Recharts
- Three.js
- Socket.IO client

### Backend
- Node.js
- Express.js
- MongoDB via Mongoose
- Socket.IO
- JWT authentication
- Multer for upload workflows

### Dev / ops
- Nodemon for local development
- PM2 configuration for service deployment
- Jest + Supertest for backend tests

## Development setup

### Prerequisites

- Node.js 18+
- MongoDB instance
- environment variables for the server

### Install dependencies

```bash
cd client
npm install

cd ../server
npm install
```

### Run locally

#### Frontend

```bash
cd client
npm run dev
```

#### Backend

```bash
cd server
npm start
```

### Default local ports

| Service | Default Port |
|---------|--------------|
| Client  | 5173         |
| Server  | 5000         |

## Architecture notes and integration

Wajibet is part of a broader ecosystem and is designed to work with federated school-platform integration patterns. The repository also contains architecture context describing the relationship between Wajibet and the Directis360 ecosystem, including shared authentication and API exchange patterns.

See:

- `EDZ-ARCHITECTURE-CONTEXT.md` for the broader architecture context
- `server/DOCUMENT_UPLOAD_API.md` for school document upload API behavior

## Summary

Wajibet is a role-based school and learning platform built around a React frontend, Express API backend, MongoDB persistence, and Socket.IO real-time orchestration. Its main value proposition is combining traditional school administration with interactive, game-based educational experiences in one unified system.

