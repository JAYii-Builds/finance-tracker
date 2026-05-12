# Finance Tracker

A full-stack finance dashboard with real-time income/expense tracking, Chart.js visualisations, and a PostgreSQL backend.

## Tech stack

- **Frontend:** React + Vite, Tailwind CSS, Chart.js
- **Backend:** Netlify Functions (serverless, Node.js)
- **Database:** PostgreSQL (any provider — Supabase, Neon, Railway, etc.)

## Deploy to Netlify

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create finance-tracker --public --push
```

### 2. Import on Netlify

1. Go to [netlify.app](https://netlify.app) → **Add new site → Import an existing project**
2. Connect your GitHub account and select the `finance-tracker` repo

### 3. Configure build settings

Netlify will detect `netlify.toml` automatically. Confirm these values:

| Setting | Value |
|---|---|
| Build command | `pnpm --filter @workspace/finance-dashboard run build:netlify` |
| Publish directory | `artifacts/finance-dashboard/dist` |
| Functions directory | `netlify/functions` |

### 4. Add environment variables

Go to **Site Settings → Environment Variables** and add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string (e.g. `postgresql://user:pass@host/db`) |

> Make sure your database has the `transactions` table. Run this SQL once:
> ```sql
> CREATE TABLE IF NOT EXISTS transactions (
>   id SERIAL PRIMARY KEY,
>   description TEXT NOT NULL,
>   amount NUMERIC(12, 2) NOT NULL,
>   category TEXT NOT NULL,
>   type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
>   created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
> );
> ```

### 5. Deploy

Click **Deploy site**. Your Finance Tracker will be live at `https://your-site.netlify.app` in ~2 minutes.

## Local development (Replit)

Both services run automatically via Replit workflows:

```bash
# API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Frontend dev server
pnpm --filter @workspace/finance-dashboard run dev
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/transactions` | Fetch all transactions |
| `POST` | `/api/transactions` | Add a transaction `{ description, amount, category, type }` |
| `DELETE` | `/api/transactions/:id` | Delete a transaction |
| `GET` | `/api/stats` | Get `totalIncome`, `totalExpenses`, `netBalance`, `savingsRate` |
