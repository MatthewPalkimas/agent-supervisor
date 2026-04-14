# Agent Supervisor

A web dashboard that monitors multiple kiro-cli agent sessions in real time.

## Architecture

- `server/` — Node.js backend: spawns `kiro-cli acp`, polls sessions, serves WebSocket
- `app/` — Next.js frontend: displays agent cards with live status

## Prerequisites

- Node.js 18+
- `kiro-cli` installed and available in PATH

## Setup

### 1. Install dependencies

```bash
cd server && npm install
cd ../app && npm install
```

### 2. Start the server

```bash
cd server
npm run dev
```

The WebSocket server starts on port 3001 (configurable via `PORT` env var).

### 3. Start the web UI

```bash
cd app
npm run dev
```

The Next.js app starts on port 3000. Open http://localhost:3000 in your browser.

### 4. Access from another device on the local network

Find your machine's local IP (e.g. `192.168.1.x`) and open:
- `http://192.168.1.x:3000` for the web UI
- The UI will connect to `ws://localhost:3001` by default

To use a custom WebSocket URL (e.g. from another device):
```bash
NEXT_PUBLIC_WS_URL=ws://192.168.1.x:3001 npm run dev
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | WebSocket server port |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | WebSocket URL for the browser |

## Usage

1. Start worker agents using `kiro-session`
2. Open the dashboard in your browser
3. Agent cards appear automatically as sessions are discovered
4. Click "Send" on any card to send a manual message to that agent
5. Idle agents with pending tasks are automatically nudged every 30 seconds
