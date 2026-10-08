import json
import os
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

app = Flask(__name__)
DATABASE = Path(__file__).with_name("classroom.db")


@contextmanager
def connect_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                phone TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                session_token TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                classroom TEXT NOT NULL,
                booking_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                purpose TEXT NOT NULL
            );
            """
        )


def provider_request(url, payload):
    api_key = os.getenv("MINIMOTH_API_KEY")
    if not api_key or not url:
        raise ValueError("Minimoth API key and endpoint URLs must be configured.")

    body = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(body, timeout=10) as response:
            response_body = response.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        app.logger.warning("Minimoth request failed: %s", error)
        raise RuntimeError("The OTP provider is unavailable. Please try again.") from error

    if not response_body:
        return {}
    try:
        return json.loads(response_body)
    except (UnicodeDecodeError, ValueError) as error:
        raise RuntimeError("The OTP provider returned an invalid response.") from error


def current_user():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None
    with connect_db() as db:
        return db.execute(
            "SELECT id, phone, name FROM users WHERE session_token = ?", (token,)
        ).fetchone()


def error(message, status):
    return jsonify(error=message), status


@app.post("/api/auth/request-otp")
def request_otp():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("A JSON object is required.", 400)
    phone = str(data.get("phone", "")).strip()
    if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        return error("Enter a phone number in international format, such as +15551234567.", 400)

    try:
        provider_request(os.getenv("MINIMOTH_SEND_OTP_URL"), {"phone": phone})
    except ValueError as exception:
        return error(str(exception), 500)
    except RuntimeError as exception:
        return error(str(exception), 502)
    return jsonify(message="One-time code sent.")


@app.post("/api/auth/verify-otp")
def verify_otp():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("A JSON object is required.", 400)
    phone = str(data.get("phone", "")).strip()
    code = str(data.get("code", "")).strip()
    name = str(data.get("name", "")).strip()
    if (
        not re.fullmatch(r"\+[1-9]\d{7,14}", phone)
        or not re.fullmatch(r"\d{4,8}", code)
        or len(name) > 80
    ):
        return error("Enter a valid phone number, one-time code, and name (up to 80 characters).", 400)

    try:
        result = provider_request(
            os.getenv("MINIMOTH_VERIFY_OTP_URL"),
            {"phone": phone, "code": code},
        )
    except ValueError as exception:
        return error(str(exception), 500)
    except RuntimeError as exception:
        return error(str(exception), 502)

    if not isinstance(result, dict) or result.get("verified") is not True:
        return error("The one-time code is invalid or expired.", 401)

    with connect_db() as db:
        user = db.execute("SELECT id, name FROM users WHERE phone = ?", (phone,)).fetchone()
        if user is None and not name:
            return error("Enter your name to create an account.", 400)
        if user is None:
            cursor = db.execute("INSERT INTO users (phone, name) VALUES (?, ?)", (phone, name))
            user_id = cursor.lastrowid
            user_name = name
        else:
            user_id = user["id"]
            user_name = user["name"]
        token = secrets.token_urlsafe(32)
        db.execute("UPDATE users SET session_token = ? WHERE id = ?", (token, user_id))

    return jsonify(token=token, user={"name": user_name, "phone": phone})


@app.get("/api/bookings")
def list_bookings():
    user = current_user()
    if user is None:
        return error("Please sign in to view bookings.", 401)
    with connect_db() as db:
        rows = db.execute(
            """SELECT id, classroom, booking_date AS date, start_time, end_time, purpose
               FROM bookings WHERE user_id = ?
               ORDER BY booking_date, start_time""",
            (user["id"],),
        ).fetchall()
    return jsonify(bookings=[dict(row) for row in rows])


@app.post("/api/bookings")
def create_booking():
    user = current_user()
    if user is None:
        return error("Please sign in to create a booking.", 401)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("A JSON object is required.", 400)
    classroom = str(data.get("classroom", "")).strip()
    booking_date = str(data.get("date", "")).strip()
    start_time = str(data.get("start_time", "")).strip()
    end_time = str(data.get("end_time", "")).strip()
    purpose = str(data.get("purpose", "")).strip()
    try:
        parsed_date = date.fromisoformat(booking_date)
        start = datetime.strptime(start_time, "%H:%M").time()
        end = datetime.strptime(end_time, "%H:%M").time()
    except ValueError:
        return error("Enter a valid date and start/end time.", 400)
    if not all((classroom, purpose)) or len(classroom) > 80 or len(purpose) > 200:
        return error("Classroom and purpose are required (up to 80 and 200 characters).", 400)
    if parsed_date < date.today() or start >= end:
        return error("Choose today or a future date and an end time later than the start time.", 400)

    with connect_db() as db:
        conflict = db.execute(
            """SELECT 1 FROM bookings
               WHERE classroom = ? AND booking_date = ?
                 AND start_time < ? AND end_time > ?""",
            (classroom, booking_date, end_time, start_time),
        ).fetchone()
        if conflict:
            return error("That classroom is already booked for this time.", 409)
        cursor = db.execute(
            """INSERT INTO bookings
               (user_id, classroom, booking_date, start_time, end_time, purpose)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user["id"], classroom, booking_date, start_time, end_time, purpose),
        )
        booking_id = cursor.lastrowid
    return jsonify(id=booking_id, message="Classroom booked."), 201


@app.delete("/api/bookings/<int:booking_id>")
def delete_booking(booking_id):
    user = current_user()
    if user is None:
        return error("Please sign in to cancel a booking.", 401)
    with connect_db() as db:
        result = db.execute(
            "DELETE FROM bookings WHERE id = ? AND user_id = ?",
            (booking_id, user["id"]),
        )
    if result.rowcount == 0:
        return error("Booking not found.", 404)
    return jsonify(message="Booking cancelled.")


initialize_db()
