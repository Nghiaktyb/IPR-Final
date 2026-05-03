# MediX — AI Radiology Diagnostic Suite

MediX is an AI-powered chest X-ray analysis platform for disease detection and clinical decision support. It uses a **FastAPI** backend and a **Next.js** frontend for real-time AI diagnostics, annotation, and PDF reports.

**Detected conditions:** Atelectasis · Effusion · Pneumonia · Nodule · Mass

---

## Prerequisites

Install these **before** you start (any recent versions are fine):

| Software | Minimum | Notes |
|----------|---------|--------|
| **Python** | 3.10+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **MySQL** | 8.0+ | [mysql.com](https://dev.mysql.com/downloads/) — required for the default setup |
| **Git** | any | [git-scm.com](https://git-scm.com/) |

> **PyTorch** is optional. Without it, the AI runs in **simulation mode** (random scores) — enough to explore the UI. For real inference, heatmaps, and the **AI Training** admin page, install PyTorch later ([see below](#optional-ai-model--pytorch)).

---

## Step-by-step: set up on another machine

Follow these steps **in order**. Use **two terminal windows** when you reach “run backend” and “run frontend”.

### Step 1 — Clone the repository

```bash
git clone https://github.com/Nghiaktyb/IPR-Final.git
cd IPR-Final
```

If your folder name is different (e.g. you renamed it to `Medix`), `cd` into that folder instead.

### Step 2 — Create the MySQL database

Open MySQL (Workbench, command line, etc.) and run:

```sql
CREATE DATABASE medix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Create or choose a MySQL user that can connect to `localhost` and has rights on `medix`. You will put that user’s **username** and **password** into `backend/.env` in Step 4.

### Step 3 — Python virtual environment and dependencies

```bash
cd backend

# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

Stay in `backend/` for the next steps while the venv is active.

### Step 4 — Environment file (`.env`)

**Do not commit your real `.env`.** Copy the template and edit it.

```bash
# Windows (in backend/)
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `backend/.env` in an editor and set at least:

1. **`DATABASE_URL`** — replace `USER` and `PASS` with your MySQL credentials:

   ```env
   DATABASE_URL=mysql+pymysql://USER:PASS@localhost:3306/medix
   ```

   Example:

   ```env
   DATABASE_URL=mysql+pymysql://root:MySecurePassword@localhost:3306/medix
   ```

2. **`SECRET_KEY`** — long random string for JWT signing (not the default in production).

Optional:

- **`MODEL_PATH`** — only if your `.pth` file is not at `backend/models/medix_model.pth`.
- **`CORS_ORIGINS`** — JSON array; add your real frontend URL when you deploy (default includes `localhost:3000`).

### Step 5 — Start the backend

Still in `backend/` with the venv activated:

```bash
python -m uvicorn app.main:app --reload
```

You should see startup lines ending with something like:

```text
[OK] Database tables initialized
[OK] Server ready at http://localhost:8000
```

Leave this terminal **open**.

Quick check: open [http://localhost:8000/api/health](http://localhost:8000/api/health) — you should get a JSON `"status": "healthy"`.

### Step 6 — Install and run the frontend

Open a **second** terminal:

```bash
cd frontend
npm install
npm run dev
```

You should see Next.js listening on **http://localhost:3000**.

**If the backend is not on `http://localhost:8000`** (different host/port), copy the template and set the API URL:

```bash
# Windows
copy .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://YOUR_BACKEND_HOST:PORT
```

Restart `npm run dev` after changing env vars.

### Step 7 — Register the first user (Administrator)

1. Open **http://localhost:3000**
2. Click **Register**
3. Enter name, email, password
4. Under **Role**, choose **Administrator** (needed for Admin → Users, AI Training, Data Retention, Audit)
5. Submit — you are logged in

Other roles can be created later; an admin can change roles under **Admin → Users**.

### Step 8 — Smoke test the app

1. **Patients** → **+ New Patient** — enter a unique **Patient ID** (e.g. hospital MRN), name, DOB, etc.
2. **Upload X-ray** for that patient — add an image; AI runs (real if PyTorch + model exist, else simulated)
3. Open the case, review findings, then **Generate Report** if available

### Step 9 — (Optional) Real AI: PyTorch + model

See [Optional: AI model & PyTorch](#optional-ai-model--pytorch).

---

## Optional: quick try with SQLite (no MySQL)

For a **local-only** trial you can use SQLite instead of MySQL. In `backend/.env` set:

```env
DATABASE_URL=sqlite:///./medix.db
```

Then run Step 5 again. Tables are created automatically. **Use MySQL for anything closer to production** (training, multiple users, typical deployment).

---

## Optional: AI model & PyTorch

The backend looks for weights at **`backend/models/medix_model.pth`** by default (folder is created on startup). If the file is missing, inference falls back to **simulation**.

### Install PyTorch (same venv as the backend)

```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

pip install torch torchvision
# NVIDIA GPU: see https://pytorch.org for the correct `--index-url` for your CUDA version
```

### Get a checkpoint

- **Copy** a trained `.pth` into `backend/models/medix_model.pth`, or  
- **Train** in the UI: **Admin → AI Training** → upload dataset → run training → **Promote** (writes to `models/medix_model.pth`).

Override path in `.env` if needed:

```env
MODEL_PATH=C:/path/to/your/medix_model.pth
```

Checkpoints, uploads, heatmaps, and reports are **not** in git — they exist only on each machine.

---

## Daily use: two terminals

| Terminal | Directory | Command |
|----------|-----------|---------|
| 1 | `backend/` | `venv\Scripts\activate` then `python -m uvicorn app.main:app --reload` |
| 2 | `frontend/` | `npm run dev` |

URLs:

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Web app |
| http://localhost:8000/api/docs | API docs |
| http://localhost:8000/api/health | Health check |

---

## Project structure (abbreviated)

```text
Medix/
├── backend/
│   ├── app/                  # FastAPI app (routers, models, services)
│   ├── .env.example          # Copy → .env (never commit .env)
│   ├── requirements.txt
│   ├── models/               # medix_model.pth (gitignored)
│   ├── uploads/              # X-rays (gitignored)
│   ├── heatmaps/             # Grad-CAM (gitignored)
│   └── reports/              # PDFs (gitignored)
└── frontend/
    ├── .env.example          # Optional → .env.local for API URL
    ├── src/
    │   ├── app/              # Next.js routes
    │   └── lib/api.js        # API client
    └── package.json
```

---

## Security notice (older clones)

If an old revision committed `backend/.env` or tracked `__pycache__`, `.pyc`, or demo `uploads/` / `heatmaps/` / `reports/`, those paths are now untracked and listed in `.gitignore`. **Passwords that were ever committed may still exist in git history** — rotate those MySQL credentials. Recreate `backend/.env` from `.env.example` and delete local `__pycache__` folders if you see odd import errors.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `ModuleNotFoundError: No module named 'app'` | Run uvicorn **from** `backend/`: `python -m uvicorn app.main:app --reload` |
| MySQL `Access denied` | `DATABASE_URL` user, password, host, database name |
| Frontend `Failed to fetch` | Backend running on port 8000; `CORS_ORIGINS` includes your frontend origin |
| Admin pages missing | First user registered as **Administrator**, or promoted under Admin → Users |
| Simulation mode / no real AI | Install `torch` + `torchvision`; place or train `medix_model.pth` |
| Training says PyTorch missing | Install PyTorch in the **same** venv as the backend, restart uvicorn |
| Wrong API host from frontend | Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` and restart `npm run dev` |

---

## License

Academic/research use — see LICENSE if present in the repository.
