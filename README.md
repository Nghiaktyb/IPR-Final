# 🏥 MediX — AI Radiology Diagnostic Suite

MediX is an AI-powered chest X-ray analysis platform for disease detection and medical diagnosis support. It combines a **FastAPI** backend with a **Next.js** frontend to provide doctors with real-time AI diagnostics, interactive annotation tools, and professional PDF report generation.

**Detected Conditions:** Atelectasis · Effusion · Pneumonia · Nodule · Mass

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#1-clone-the-repository)
3. [MySQL Database Setup](#2-mysql-database-setup)
4. [Backend Setup (FastAPI)](#3-backend-setup-fastapi)
5. [Frontend Setup (Next.js)](#4-frontend-setup-nextjs)
6. [AI Model Setup (Optional)](#5-ai-model-setup-optional)
7. [Running the Application](#6-running-the-application)
8. [Creating Your First Account](#7-creating-your-first-account)
9. [Project Structure](#project-structure)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Make sure the following are installed on your machine before starting:

| Software   | Version  | Download Link                                     |
| ---------- | -------- | ------------------------------------------------- |
| **Python** | ≥ 3.10   | [python.org](https://www.python.org/downloads/)    |
| **Node.js**| ≥ 18     | [nodejs.org](https://nodejs.org/)                  |
| **MySQL**  | ≥ 8.0    | [mysql.com](https://dev.mysql.com/downloads/)      |
| **Git**    | any      | [git-scm.com](https://git-scm.com/)               |

> **Note:** If you do not install PyTorch (see Step 5), the AI engine will run in **simulation mode** — it will generate random confidence scores instead of real predictions. This is fine for UI development and testing.

---

## 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/Medix.git
cd Medix
```

---

## 2. MySQL Database Setup

Open your MySQL client (MySQL Workbench, terminal, etc.) and create the database:

```sql
CREATE DATABASE medix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> **Important:** Remember the MySQL **username** and **password** you use. You will need them in the next step.

The application will automatically create all required tables on first startup — no manual table creation needed.

---

## 3. Backend Setup (FastAPI)

### 3.1 Navigate to the backend directory

```bash
cd backend
```

### 3.2 Create a Python virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3.3 Install Python dependencies

```bash
pip install -r requirements.txt
```

You also need the MySQL driver:

```bash
pip install pymysql cryptography
```

### 3.4 Configure environment variables

Copy the example environment file:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open the `.env` file and update the **DATABASE_URL** with your MySQL credentials:

```env
# Replace <username> and <password> with your MySQL credentials
DATABASE_URL=mysql+pymysql://<username>:<password>@localhost:3306/medix
```

**Example** (with user `root` and password `MyPassword123`):

```env
DATABASE_URL=mysql+pymysql://root:MyPassword123@localhost:3306/medix
```

Also set a strong secret key for JWT authentication:

```env
SECRET_KEY=your-own-strong-random-secret-key
```

### 3.5 Test the backend starts correctly

```bash
python -m uvicorn app.main:app --reload
```

You should see:

```
[MedicX] Starting AI Radiology Diagnostic Suite
[OK] Database tables initialized
[OK] Server ready at http://localhost:8000
[OK] API docs at http://localhost:8000/api/docs
```

> ✅ Leave this terminal open and running. Open a **new terminal** for the frontend.

---

## 4. Frontend Setup (Next.js)

### 4.1 Open a new terminal and navigate to the frontend directory

```bash
cd frontend
```

### 4.2 Install Node.js dependencies

```bash
npm install
```

### 4.3 Start the development server

```bash
npm run dev
```

You should see:

```
▲ Next.js 16.x.x
- Local: http://localhost:3000
```

> ✅ The frontend will automatically connect to the backend at `http://localhost:8000`.

---

## 5. AI Model Setup (Optional)

By default, the AI engine runs in **simulation mode**. To enable real AI predictions:

### 5.1 Install PyTorch

```bash
# CPU only
pip install torch torchvision

# With CUDA (NVIDIA GPU) — check https://pytorch.org for your version
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### 5.2 Place the model file

The application expects the trained model at the path configured in `backend/app/config.py` → `MODEL_PATH`.

Default path: `../../medix/medix/medix_model.pth` (relative to the backend directory).

You can override this by setting `MODEL_PATH` in your `.env` file:

```env
MODEL_PATH=C:/path/to/your/medix_model.pth
```

---

## 6. Running the Application

You need **two terminals** running simultaneously:

### Terminal 1 — Backend

```bash
cd backend
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
python -m uvicorn app.main:app --reload
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

### Access the application

| URL                              | Description          |
| -------------------------------- | -------------------- |
| `http://localhost:3000`          | Main application UI  |
| `http://localhost:8000/api/docs` | API documentation    |
| `http://localhost:8000/api/health` | Health check       |

---

## 7. Creating Your First Account

1. Open `http://localhost:3000` in your browser.
2. Click **Register** to create a new doctor account.
3. Fill in your name, email, and password.
4. After registration, you will be logged in automatically.

### Quick workflow

1. **Create a Patient** — Go to "Patients" → Click "+ New Patient" → Enter name, DOB, sex, blood type, and medical history.
2. **Upload an X-ray** — Click "Upload X-ray" for a patient → Fill in visit vitals (weight, height, BP, etc.) → Drop an image.
3. **Review AI Results** — The AI will automatically analyze the X-ray. Review flagged conditions and validate or reject each finding.
4. **Generate Report** — Click "Generate Report" to create a professional PDF with all patient details, vitals, and AI analysis.

---

## Project Structure

```
Medix/
├── backend/
│   ├── app/
│   │   ├── config.py          # Application settings & env loading
│   │   ├── database.py        # SQLAlchemy engine & session
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── middleware/        # JWT auth & logging middleware
│   │   ├── models/            # SQLAlchemy ORM models
│   │   │   ├── case.py        # Case & Finding models
│   │   │   ├── patient.py     # Patient model
│   │   │   ├── report.py      # Report model
│   │   │   └── user.py        # User model
│   │   ├── routers/           # API route handlers
│   │   │   ├── auth.py        # Login / Register
│   │   │   ├── cases.py       # X-ray upload & AI analysis
│   │   │   ├── patients.py    # Patient CRUD
│   │   │   ├── reports.py     # PDF report generation
│   │   │   └── admin.py       # Admin panel
│   │   ├── schemas/           # Pydantic request/response models
│   │   └── services/          # Business logic
│   │       ├── ai_service.py       # PyTorch model wrapper
│   │       ├── gradcam_service.py  # Heatmap generation
│   │       └── report_service.py   # PDF report builder
│   ├── .env.example           # Environment template
│   ├── requirements.txt       # Python dependencies
│   ├── uploads/               # Uploaded X-ray images
│   ├── heatmaps/              # AI-generated Grad-CAM heatmaps
│   └── reports/               # Generated PDF reports
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── auth/          # Login & Register pages
    │   │   ├── cases/
    │   │   │   ├── new/       # Upload X-ray page
    │   │   │   └── [id]/      # Diagnostic Viewer
    │   │   ├── patients/
    │   │   │   ├── page.js    # Patient Directory
    │   │   │   └── [id]/      # Patient Profile & History
    │   │   └── layout.js      # Root layout with sidebar
    │   ├── components/        # Shared UI components
    │   └── lib/
    │       └── api.js         # API client
    └── package.json
```

---

## Troubleshooting

### ❌ `NameError: name 'Text' is not defined`
Make sure all SQLAlchemy model files import the correct column types. Check the import line in the affected model file.

### ❌ `ModuleNotFoundError: No module named 'app'`
You must run the backend from inside the `backend/` directory:
```bash
cd backend
python -m uvicorn app.main:app --reload
```

### ❌ `Access denied for user` (MySQL)
Double-check the username and password in your `backend/.env` file match your MySQL credentials.

### ❌ `Failed to fetch` (Frontend)
Ensure the backend is running on `http://localhost:8000` before using the frontend. Check that CORS is configured correctly in `.env`.

### ❌ AI is in "Simulation Mode"
This is normal if PyTorch is not installed. Install `torch` and `torchvision` and place the model file to enable real predictions. See [Step 5](#5-ai-model-setup-optional).

---

## License

This project is part of an academic/research initiative. See LICENSE file for details.
