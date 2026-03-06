# Slot Booking Web Application (FastAPI + MySQL)

Simple slot-booking web app where users can:
- View available slots
- Book a slot
- View already booked slots

## Project Structure

```text
slot-booking/
|
|-- frontend/
|   |-- index.html
|   |-- login.html
|   |-- slots.html
|   |-- book.html
|   |-- booked.html
|   |-- css/
|   |   `-- style.css
|   `-- js/
|       `-- script.js
|
|-- backend/
|   |-- app.py
|   |-- schema.sql
|   `-- seed.sql
|
|-- requirements.txt
|-- .env.example
|-- netlify.toml
`-- README.md
```

## 1) Local Setup

1. Create DB schema:

```sql
mysql -u root -p < backend/schema.sql
```

If your schema was already created earlier, run this once to add users table for login/register:

```sql
mysql -u root -p < backend/auth_migration.sql
```

2. Configure environment:

```powershell
Copy-Item .env.example .env
```

Update values inside `.env`.

3. Install Python dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

4. Run backend:

```powershell
uvicorn backend.app:app --host 0.0.0.0 --port 5000 --reload
```

Open `http://localhost:5000`.
Login page: `http://localhost:5000/login.html`

## 2) Initialize Slots (One-Time)

Use this API once to add slots:

```bash
curl -X POST http://localhost:5000/api/init \
  -H "Content-Type: application/json" \
  -d "{\"slots\":[\"2026-03-06T10:00:00\",\"2026-03-06T11:00:00\",\"2026-03-06T12:00:00\"]}"
```

## 2b) Seed Multiple Demo Slots (Booked + Available)

If you want pre-filled demo data, run [seed.sql](C:\Projects\slot-booking\backend\seed.sql) in MySQL Workbench.

It will insert 12 slots with mixed status and sample bookings.

## 3) Push to GitHub

```powershell
git init
git add .
git commit -m "Initial slot booking app"
git branch -M main
git remote add origin https://github.com/<your-username>/slot-booking.git
git push -u origin main
```

## 4) Deploy Frontend on Netlify

1. Go to Netlify and click `Add new site` -> `Import an existing project`.
2. Connect GitHub and choose your `slot-booking` repo.
3. Build settings:
   - Build command: leave empty
   - Publish directory: `frontend`
4. Deploy site.

Netlify will provide a domain like:

```text
https://your-site-name.netlify.app
```

## 5) Backend Hosting Note

Netlify site hosting here is static frontend only. Python + MySQL backend must be deployed separately (for example Render, Railway, or VPS).

After backend deployment:
- Update `netlify.toml` redirect target:

```toml
to = "https://your-backend-url.com/api/:splat"
```

- Redeploy Netlify so `/api/*` calls route to your live backend.

## API Endpoints

- `GET /api/slots` -> available slots
- `POST /api/book` -> book a slot
- `GET /api/bookings` -> booked slots
- `POST /api/init` -> initialize slot list
