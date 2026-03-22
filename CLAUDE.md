# SmallBiz Hub — Small Business Management Platform
> פרומפט + תוכנית עבודה לקלוד קוד

---

## הפרומפט לקלוד קוד

```
You are building a production-ready Small Business Management Platform — a multi-user SPA (Single Page Application) with a clean admin panel UI.

## Project Name
SmallBiz Hub — A unified dashboard for small business operations

## Tech Stack (STRICT — do not deviate)
- Backend: Python + FastAPI
- ORM: SQLAlchemy 2.x (async) with asyncpg driver
- Database: Supabase (PostgreSQL)
- Auth: JWT tokens (python-jose) + bcrypt password hashing
- Frontend: Vanilla JS (ES6 modules) + Bootstrap 5.3
- Session: Support concurrent multi-user sessions via JWT (stateless)
- No frontend framework (React/Vue) — pure JS SPA with fetch API

## Architecture Overview
Single HTML file (index.html) acts as the SPA shell.
All page transitions happen via JS routing (hash-based: #login, #dashboard, #users, etc.).
Backend serves a REST API on /api/* routes.
FastAPI also serves the static SPA shell.

## Database Schema (create via SQLAlchemy models)
Tables:
- users: id (UUID PK), email (unique), full_name, hashed_password, role (admin/manager/staff), is_active, created_at, last_login
- sessions: id (UUID PK), user_id (FK), token_hash, created_at, expires_at, ip_address, user_agent
- audit_log: id, user_id (FK), action, resource, details (JSON), timestamp

## Features to Implement

### Authentication (Priority 1)
- POST /api/auth/register — register new user (admin only can register others, or open registration if first user)
- POST /api/auth/login — returns JWT access token + refresh token
- POST /api/auth/logout — invalidates session token in DB
- POST /api/auth/refresh — refresh access token
- GET /api/auth/me — get current user profile
- Support simultaneous logins from multiple devices/users (stateless JWT design)

### User Management (Priority 2)
- GET /api/users — list all users (admin only)
- POST /api/users — create user (admin only)
- GET /api/users/{id} — get user details
- PUT /api/users/{id} — update user
- DELETE /api/users/{id} — soft delete (set is_active=False)

### Dashboard (Priority 3)
- GET /api/dashboard/stats — return: total users, active sessions, recent logins

## UI Layout (SPA Shell — index.html)
Build a full admin panel template with:

**Sidebar** (fixed left, 260px wide):
- App logo/name at top
- Navigation links: Dashboard, Users, Profile, Settings
- User avatar + name + logout button at bottom
- Collapsible on mobile

**Header** (fixed top):
- Page title (dynamic, changes per route)
- Breadcrumb
- Notification bell icon
- User dropdown menu

**Main Content Area**:
- Router outlet — content swaps here based on hash route
- Pages: Login, Register, Dashboard (stats cards + recent activity table), Users List (DataTable with search/filter), User Detail/Edit form, Profile page

**Footer**: App version, copyright

## Design Requirements
- Bootstrap 5.3 via CDN
- Bootstrap Icons via CDN
- Color scheme: Professional blue (#0d6efd) primary, clean white cards, subtle shadows
- Responsive: works on mobile and desktop
- Toast notifications for all actions (success/error)
- Loading spinners during API calls
- Form validation with inline error messages
- Confirm dialogs for destructive actions

## File Structure to Create
```
project/
├── main.py                 # FastAPI app entry point
├── config.py               # Settings (env vars)
├── database.py             # SQLAlchemy async engine + session
├── models/
│   ├── __init__.py
│   ├── user.py
│   └── session.py
├── schemas/
│   ├── __init__.py
│   ├── auth.py
│   └── user.py
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   └── users.py
├── services/
│   ├── auth_service.py
│   └── user_service.py
├── middleware/
│   └── auth_middleware.py
├── static/
│   └── app.js              # SPA JavaScript router + all page logic
├── templates/
│   └── index.html          # SPA shell with Bootstrap
├── requirements.txt
├── .env.example
└── README.md
```

## Environment Variables Required (.env.example)
```
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FIRST_ADMIN_EMAIL=admin@example.com
FIRST_ADMIN_PASSWORD=changeme123
```

## Coding Standards
- Use SQLAlchemy 2.x style (select(), not query())
- All DB operations must be async
- Pydantic v2 for schemas
- Dependency injection for auth (Depends(get_current_user))
- CORS enabled for development
- All endpoints return consistent JSON: {"success": bool, "data": ..., "message": str}
- Passwords hashed with bcrypt (passlib)
- JWT tokens include: user_id, email, role, exp

## Implementation Order
1. Database models + SQLAlchemy setup
2. Pydantic schemas
3. Auth service (register, login, logout, JWT)
4. Auth router
5. User service + router
6. Dashboard stats endpoint
7. Frontend SPA shell (index.html)
8. Frontend JS router + auth pages
9. Frontend dashboard + users pages
10. README with setup instructions

## Special Requirements
- First user to register automatically becomes admin
- JWT is stateless but sessions are tracked in DB for audit/logout
- Logout invalidates the specific session token in DB
- Multi-device login: each login creates a new session record
- Token refresh endpoint must validate against DB session

Start by creating all files in the correct structure. Make the code production-quality with proper error handling, not just a prototype.
```

---

## תוכנית עבודה — מינימום איטרציות

### שלב 1 — הכנת הסביבה (לפני הרצת קלוד קוד)

1. צור תיקיית פרויקט ריקה
2. הכן קובץ `.env` עם פרטי Supabase אמיתיים (connection string, סיסמאות)
3. ודא שיש Python 3.11+ מותקן
4. הפעל קלוד קוד בטרמינל בתוך התיקייה: `claude`

### שלב 2 — הרצת הפרומפט הראשי

הדבק את הפרומפט המלא מהסעיף הקודם כפתיחה של שיחה חדשה. קלוד קוד ייצור את כל המבנה בבת אחת.

> **טיפ:** הפרומפט כתוב כך שקלוד קוד יקבל את כל ההחלטות הארכיטקטוניות מראש — לא יצטרך לנחש ולא יבקש clarifications. זה מה שמקטין איטרציות.

### שלב 3 — בקשת אימות והרצה (מיד אחרי הפרומפט)

שלח את ההמשך הזה מיד לאחר הפרומפט:

```
After creating all files:
1. Run: pip install -r requirements.txt
2. Run: python -c "from database import init_db; import asyncio; asyncio.run(init_db())" to create tables
3. Run: uvicorn main:app --reload
4. Verify the app loads at http://localhost:8000
Fix any import errors or missing dependencies before stopping.
```

### שלב 4 — בדיקת flow מלא (רק אם יש בעיות)

```
Test the following flow and fix any issues:
1. Register first user via POST /api/auth/register
2. Login via POST /api/auth/login
3. Access GET /api/auth/me with the token
4. Open http://localhost:8000 and verify the SPA loads with login page
```

## Git Setup (run once at project start)
1. Check if git is initialized — if not, run git init
2. Check if remote origin exists — if not, ask me for the GitHub URL
3. Ensure .gitignore exists with: .env, .venv, __pycache__, *.pyc
4. Make initial commit if no commits exist

## Git Workflow (every session)
After every meaningful change, ask:
"Ready to commit. Suggested message: [feat/fix/chore]: [description] — approve or edit?"
Wait for my approval before pushing.
---

*SmallBiz Hub • נוצר עם Claude*
