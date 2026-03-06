import os
import hashlib
import secrets
import logging
from datetime import datetime
from pathlib import Path
from typing import List

import mysql.connector
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from mysql.connector import Error
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Slot Booking API")
logger = logging.getLogger("slot_booking")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


class BookRequest(BaseModel):
    slot_id: int
    user_name: str
    user_email: str


class InitSlotsRequest(BaseModel):
    slots: List[str]


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "slot_booking"),
        connection_timeout=5,
    )


def normalize_datetime(value):
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$", 1)
    if len(parts) != 2:
        return False
    salt, digest = parts
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000
    ).hex()
    return secrets.compare_digest(candidate, digest)


def ensure_users_table():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
    except Error as exc:
        logger.warning("Could not ensure users table at startup: %s", exc)
        return False
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()
    return True


@app.on_event("startup")
def startup_event():
    ensured = ensure_users_table()
    if not ensured:
        logger.warning(
            "App started without DB initialization. Check MYSQL_* env vars and DB reachability."
        )


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/slots")
def get_available_slots():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT id, slot_time
            FROM slots
            WHERE is_booked = 0
            ORDER BY slot_time ASC
            """
        )
        rows = cursor.fetchall()
        return rows
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.post("/api/register", status_code=201)
def register_user(payload: RegisterRequest):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="name, email and password are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        existing = cursor.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        pwd_hash = hash_password(password)
        cursor.execute(
            """
            INSERT INTO users (name, email, password_hash)
            VALUES (%s, %s, %s)
            """,
            (name, email, pwd_hash),
        )
        connection.commit()
        return {"message": "Registration successful"}
    except HTTPException:
        raise
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.post("/api/login")
def login_user(payload: LoginRequest):
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT id, name, email, password_hash
            FROM users
            WHERE email = %s
            """,
            (email,),
        )
        user = cursor.fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        return {
            "message": "Login successful",
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
        }
    except HTTPException:
        raise
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.get("/api/bookings")
def get_bookings():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT b.id, b.user_name, b.user_email, s.slot_time
            FROM bookings b
            JOIN slots s ON s.id = b.slot_id
            ORDER BY s.slot_time ASC
            """
        )
        rows = cursor.fetchall()
        return rows
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.post("/api/book", status_code=201)
def book_slot(payload: BookRequest):
    slot_id = payload.slot_id
    user_name = payload.user_name.strip()
    user_email = payload.user_email.strip()

    if not user_name or not user_email:
        raise HTTPException(
            status_code=400,
            detail="slot_id, user_name, and user_email are required",
        )

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        connection.start_transaction()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, is_booked FROM slots WHERE id = %s FOR UPDATE",
            (slot_id,),
        )
        slot = cursor.fetchone()
        if not slot:
            connection.rollback()
            raise HTTPException(status_code=404, detail="Slot not found")

        if slot["is_booked"] == 1:
            connection.rollback()
            raise HTTPException(status_code=409, detail="Slot already booked")

        cursor.execute(
            """
            INSERT INTO bookings (slot_id, user_name, user_email)
            VALUES (%s, %s, %s)
            """,
            (slot_id, user_name, user_email),
        )
        cursor.execute("UPDATE slots SET is_booked = 1 WHERE id = %s", (slot_id,))
        connection.commit()
        return {"message": "Slot booked successfully"}
    except HTTPException:
        raise
    except Error as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.post("/api/init", status_code=201)
def init_slots(payload: InitSlotsRequest):
    slots = payload.slots
    if len(slots) == 0:
        raise HTTPException(
            status_code=400,
            detail="Provide slots as a non-empty list of ISO datetime strings",
        )

    parsed = []
    for value in slots:
        dt = normalize_datetime(value)
        if not dt:
            raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}")
        parsed.append(dt)

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        for dt in parsed:
            cursor.execute(
                """
                INSERT IGNORE INTO slots (slot_time, is_booked)
                VALUES (%s, 0)
                """,
                (dt,),
            )
        connection.commit()
        return {"message": f"Initialized {len(parsed)} slots"}
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("APP_PORT", os.getenv("FLASK_RUN_PORT", "5000")))
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=True)
