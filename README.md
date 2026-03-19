# SmallBiz Hub

A production-ready Small Business Management Platform — multi-user SPA with FastAPI backend.

## Stack
- **Backend**: Python + FastAPI + SQLAlchemy 2.x (async)
- **Database**: PostgreSQL via asyncpg (Supabase-compatible)
- **Auth**: JWT (access + refresh tokens) + bcrypt
- **Frontend**: Vanilla JS ES6 SPA + Bootstrap 5.3

## Setup

### 1. Clone & install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Supabase connection string and a strong JWT secret
```

### 3. Create database tables
```bash
python -c "from database import init_db; import asyncio; asyncio.run(init_db())"
```

### 4. Run the server
```bash
uvicorn main:app --reload
```

Open http://localhost:8000 — the login page will appear.

## First-time use

The first user to register automatically becomes **admin**. Go to `#register` to create the first account.

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/register` | Register user (open if first) | — / Admin |
| POST | `/api/auth/login` | Login, returns tokens | — |
| POST | `/api/auth/logout` | Invalidate session | Bearer |
| POST | `/api/auth/refresh` | Rotate tokens | — |
| GET  | `/api/auth/me` | Current user profile | Bearer |
| GET  | `/api/users` | List all users | Admin |
| POST | `/api/users` | Create user | Admin |
| GET  | `/api/users/{id}` | Get user | Bearer |
| PUT  | `/api/users/{id}` | Update user | Bearer |
| DELETE | `/api/users/{id}` | Deactivate user | Admin |
| GET  | `/api/dashboard/stats` | Dashboard stats | Bearer |

## Project Structure

```
├── main.py              FastAPI app + SPA serving
├── config.py            Settings from .env
├── database.py          Async SQLAlchemy engine
├── models/              SQLAlchemy ORM models
├── schemas/             Pydantic v2 schemas
├── routers/             FastAPI route handlers
├── services/            Business logic
├── middleware/          JWT auth dependency
├── static/app.js        SPA JavaScript
└── templates/index.html SPA shell
```
