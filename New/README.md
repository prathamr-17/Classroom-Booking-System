# Classroom Booking System

A small React + Flask app for booking classrooms. Sign in with a phone number and a one-time code sent and verified by Minimoth.

## Requirements

- Node.js 18+
- Python 3.10+
- Minimoth API credentials and endpoints that support the contract below

## Run locally

1. In `backend`, create a virtual environment, install dependencies, and configure the provider:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

   Set the Minimoth values in `backend/.env`, then start Flask:

   ```powershell
   flask --app app run --debug
   ```

2. In a second terminal, configure and start React:

   ```powershell
   cd frontend
   npm install
   Copy-Item .env.example .env
   npm run dev
   ```

3. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

The SQLite database is created at `backend/classroom.db` on first start. Vite proxies `/api` to Flask during development; the browser never receives the Minimoth API key.

## Minimoth API contract

The backend sends JSON over HTTPS with `Authorization: Bearer <MINIMOTH_API_KEY>` and `Content-Type: application/json`.

- `MINIMOTH_SEND_OTP_URL`: `POST` with `{"phone": "+15551234567"}`; any 2xx response means the code was sent.
- `MINIMOTH_VERIFY_OTP_URL`: `POST` with `{"phone": "+15551234567", "code": "123456"}`; return JSON `{"verified": true}` for a valid code.

Both endpoint URLs and the API key are backend-only settings in `backend/.env`. Adjust the request/response mapping in `backend/app.py` if your Minimoth account uses a different contract.
