# Wajibet

Public school organization and educational game platform.

## Structure

```
├── client/    # React frontend (Vite + TailwindCSS)
└── server/    # Express.js backend (MongoDB + Socket.io)
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB

### Server Setup

```bash
cd server
cp ../. env.example .env   # Then edit .env with your values
npm install
npm start
```

### Client Setup

```bash
cd client
npm install
npm run dev
```

### Default Ports

| Service | Port |
|---------|------|
| Client (Vite) | 5173 |
| Server (Express) | 5000 |

## Integration

This platform integrates with [Directis360](https://github.com/Zakyahouu/Directis360) via federated authentication. See `EDZ-ARCHITECTURE-CONTEXT.md` for full architecture details.
