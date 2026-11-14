import hashlib
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
DATABASE = DATA_DIR / "portfolio.sqlite3"
MAX_UPLOAD = 10 * 1024 * 1024
SESSION_TTL = 12 * 60 * 60
SECURE_COOKIE = os.environ.get("PORTFOLIO_HTTPS") == "1"
SESSIONS = {}
SESSIONS_LOCK = __import__("threading").Lock()

INITIAL_CONTENT = {
    "profile": {
        "name": "Pailla Pooja",
        "initials": "PP",
        "title": "B.Tech Student — Artificial Intelligence & Machine Learning",
        "location": "Hyderabad, Telangana, India",
        "email": "poojapailla77@gmail.com",
        "phone": "9392741369",
        "linkedin": "https://linkedin.com/in/pooja-pailla",
        "github": "https://github.com/poojapailla",
        "availability": "Open to Internships",
        "image": "",
    },
    "summary": "Aspiring B.Tech student specializing in Artificial Intelligence and Machine Learning with a strong interest in developing intelligent systems and solving real-world problems using technology. Skilled in programming with Python and C and familiar with core computer science concepts such as data structures and algorithms. Passionate about learning modern AI tools and applying logical thinking to build innovative software solutions.",
    "education": [
        {
            "institution": "Anurag University",
            "location": "Hyderabad, Telangana",
            "degree": "Bachelor of Technology (B.Tech)",
            "branch": "Artificial Intelligence & Machine Learning",
            "duration": "2024–2028",
            "result": "Current CGPA: 8.9",
            "coursework": ["Machine Learning", "Data Structures", "Programming Fundamentals", "AI Basics"],
        },
        {
            "institution": "Global Indian International School",
            "location": "Hyderabad",
            "degree": "Intermediate (MPC)",
            "duration": "2022–2024",
            "result": "Percentage: 73%",
            "coursework": ["Mathematics", "Physics", "Chemistry"],
        },
        {
            "institution": "Vijayaratna High School",
            "location": "Hyderabad",
            "degree": "SSC (Secondary School Certificate)",
            "result": "CGPA: 9.3",
        },
    ],
    "experience": [
        {
            "company": "Thiranex",
            "role": "Full Stack Development Intern",
            "dates": "",
            "responsibilities": [
                "Worked as a Full Stack Development Intern, contributing to the design and development of web-based applications.",
                "Gained hands-on experience across front-end and back-end technologies, collaborating on real-world project tasks.",
                "Strengthened practical skills in building functional, user-friendly web solutions as part of a development team.",
            ],
        },
        {
            "company": "EduSkills",
            "role": "Generative AI Intern",
            "dates": "",
            "responsibilities": [
                "Completed an internship focused on Generative AI, covering core concepts, tools, and practical applications.",
                "Gained hands-on exposure to prompt engineering and generative AI-based workflows.",
            ],
        },
    ],
    "projects": [
        {
            "name": "Smart Expense Tracker",
            "description": "Developed a Smart Expense Tracker using Python to monitor daily expenses and categorize financial transactions.",
            "features": ["Expense logging", "Automatic categorization", "Budget tracking", "Visual reports", "Spending pattern analysis", "Personal financial management"],
            "image": "",
            "link": "",
        },
        {
            "name": "Home Virtual Lab",
            "description": "Developed a web-based application to simulate laboratory experiments in a virtual environment.",
            "features": ["Step-by-step experiment instructions", "Interactive visual experiment results", "Virtual laboratory environment", "Remote experiment learning", "Accessible practical learning without requiring physical lab equipment"],
            "image": "",
            "link": "",
        },
    ],
    "skills": {
        "Programming Languages": ["Python", "Java", "SQL", "C"],
        "Web Technologies": ["HTML", "CSS", "JavaScript"],
        "AI / ML": ["Generative AI Tools", "Prompt Engineering", "NumPy", "Pandas", "Machine Learning Fundamentals"],
        "Core Computer Science Concepts": ["Advanced Data Structures", "Data Structures and Algorithms", "Programming Fundamentals"],
        "Soft Skills": ["Teamwork", "Collaboration", "Adaptability", "Problem Solving"],
    },
    "certifications": [
        {"name": "HackerRank Certification", "certification": "Problem Solving", "file": ""},
        {"name": "Simplilearn Certification", "certification": "Generative AI and Prompt Engineering", "file": ""},
    ],
    "resume": {"file": ""},
}


@contextmanager
def db_connection():
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    with db_connection() as db:
        db.execute("CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id = 1), salt BLOB NOT NULL, password_hash BLOB NOT NULL)")
        db.execute(
            "INSERT OR IGNORE INTO content (id, body) VALUES (1, ?)",
            (json.dumps(INITIAL_CONTENT, ensure_ascii=False),),
        )


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)


class Handler(BaseHTTPRequestHandler):
    server_version = "PoojaPortfolio/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, status, value, headers=None):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        if headers:
            for name, value in headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, limit=2 * 1024 * 1024):
        length = int(self.headers.get("Content-Length", "0"))
        if length > limit:
            raise ValueError("Request is too large.")
        return json.loads(self.rfile.read(length) or b"{}")

    def client_session(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get("portfolio_session")
        token = morsel.value if morsel else ""
        with SESSIONS_LOCK:
            session = SESSIONS.get(token)
            if session and session["expires"] > time.time():
                return token, session
            SESSIONS.pop(token, None)
        return token, None

    def authenticated(self, require_csrf=False):
        token, session = self.client_session()
        if not session:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Please sign in again."})
            return None
        if require_csrf and not hmac.compare_digest(session["csrf"], self.headers.get("X-CSRF-Token", "")):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Invalid security token. Refresh and try again."})
            return None
        return session

    def setup_is_available(self):
        with db_connection() as db:
            return db.execute("SELECT 1 FROM admin WHERE id = 1").fetchone() is None

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/status":
            self.send_json(200, {"setupRequired": self.setup_is_available()})
            return
        if path == "/api/content":
            with db_connection() as db:
                row = db.execute("SELECT body FROM content WHERE id = 1").fetchone()
            self.send_json(200, json.loads(row["body"]))
            return
        if path == "/api/session":
            _, session = self.client_session()
            if session:
                self.send_json(200, {"authenticated": True, "csrf": session["csrf"]})
            else:
                self.send_json(200, {"authenticated": False})
            return
        if path.startswith("/uploads/"):
            self.serve_upload(path)
            return
        if path == "/":
            path = "/index.html"
        if path == "/admin":
            path = "/admin.html"
        self.serve_static(path)

    def serve_static(self, path):
        if path not in {"/index.html", "/admin.html", "/styles.css", "/app.js", "/admin.js"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        candidate = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in candidate.parents or not candidate.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith(("text/", "application/javascript")) else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def serve_upload(self, path):
        name = Path(path).name
        candidate = (UPLOAD_DIR / name).resolve()
        if candidate.parent != UPLOAD_DIR.resolve() or not candidate.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Disposition", "inline")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/setup":
            self.setup_admin()
        elif path == "/api/login":
            self.login()
        elif path == "/api/logout":
            self.logout()
        elif path == "/api/upload":
            self.upload()
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})

    def setup_admin(self):
        try:
            if not ipaddress.ip_address(self.client_address[0]).is_loopback:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "Initial setup is only allowed from this computer."})
                return
            body = self.read_json()
            password = body.get("password", "")
            if not isinstance(password, str) or len(password) < 12:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Use a password with at least 12 characters."})
                return
            salt = secrets.token_bytes(16)
            digest = password_hash(password, salt)
            with db_connection() as db:
                db.execute("INSERT INTO admin (id, salt, password_hash) VALUES (1, ?, ?)", (salt, digest))
            self.create_session()
        except sqlite3.IntegrityError:
            self.send_json(HTTPStatus.CONFLICT, {"error": "The owner account is already set up. Please sign in."})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "Invalid request."})

    def login(self):
        try:
            body = self.read_json()
            password = body.get("password", "")
            with db_connection() as db:
                row = db.execute("SELECT salt, password_hash FROM admin WHERE id = 1").fetchone()
            if not row:
                self.send_json(HTTPStatus.CONFLICT, {"error": "Create your owner password first."})
            elif isinstance(password, str) and hmac.compare_digest(password_hash(password, row["salt"]), row["password_hash"]):
                self.create_session()
            else:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Incorrect password."})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "Invalid request."})

    def create_session(self):
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        with SESSIONS_LOCK:
            SESSIONS[token] = {"csrf": csrf, "expires": time.time() + SESSION_TTL}
        cookie = "portfolio_session=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%d" % (token, SESSION_TTL)
        if SECURE_COOKIE:
            cookie += "; Secure"
        self.send_json(200, {"authenticated": True, "csrf": csrf}, {"Set-Cookie": cookie})

    def logout(self):
        token, _ = self.client_session()
        with SESSIONS_LOCK:
            SESSIONS.pop(token, None)
        cookie = "portfolio_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
        if SECURE_COOKIE:
            cookie += "; Secure"
        self.send_json(200, {"authenticated": False}, {"Set-Cookie": cookie})

    def do_PUT(self):
        if urlparse(self.path).path != "/api/content":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return
        if not self.authenticated(require_csrf=True):
            return
        try:
            content = self.read_json()
            if not isinstance(content, dict):
                raise ValueError("Portfolio content must be a JSON object.")
            serialized = json.dumps(content, ensure_ascii=False)
            with db_connection() as db:
                db.execute("UPDATE content SET body = ? WHERE id = 1", (serialized,))
            self.send_json(200, {"saved": True})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "Invalid content."})

    def upload(self):
        if not self.authenticated(require_csrf=True):
            return
        try:
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data;"):
                raise ValueError("Choose a file to upload.")
            boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
            if not boundary or len(boundary) > 200:
                raise ValueError("Invalid upload.")
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_UPLOAD + 64 * 1024:
                raise ValueError("Files must be 10 MB or smaller.")
            raw = self.rfile.read(length)
            parts = raw.split(("--" + boundary).encode())
            upload_data = None
            original_name = ""
            for part in parts:
                if b"\r\n\r\n" not in part:
                    continue
                headers, payload = part.split(b"\r\n\r\n", 1)
                disposition = next(
                    (
                        line.split(":", 1)[1].strip()
                        for line in headers.decode("latin-1", errors="ignore").split("\r\n")
                        if line.lower().startswith("content-disposition:")
                    ),
                    "",
                )
                if 'name="file"' in disposition:
                    match = re.search(r'(?:^|;)\s*filename="([^"]*)"', disposition)
                    if match:
                        original_name = match.group(1)
                    upload_data = payload.removesuffix(b"\r\n")
                    break
            if upload_data is None or not original_name:
                raise ValueError("Choose a file to upload.")
            if len(upload_data) > MAX_UPLOAD:
                raise ValueError("Files must be 10 MB or smaller.")
            extension = Path(original_name).suffix.lower()
            allowed = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf"}
            if extension not in allowed:
                raise ValueError("Upload a PNG, JPG, WEBP, or PDF file.")
            signatures = {
                ".png": upload_data.startswith(b"\x89PNG\r\n\x1a\n"),
                ".jpg": upload_data.startswith(b"\xff\xd8\xff"),
                ".jpeg": upload_data.startswith(b"\xff\xd8\xff"),
                ".webp": len(upload_data) >= 12 and upload_data[:4] == b"RIFF" and upload_data[8:12] == b"WEBP",
                ".pdf": upload_data.startswith(b"%PDF-"),
            }
            if not signatures[extension]:
                raise ValueError("The file contents do not match the selected file type.")
            name = uuid.uuid4().hex + extension
            (UPLOAD_DIR / name).write_bytes(upload_data)
            self.send_json(200, {"url": "/uploads/" + name, "name": Path(original_name).name})
        except (ValueError, IndexError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error) or "Invalid upload."})


if __name__ == "__main__":
    initialize()
    host = os.environ.get("PORTFOLIO_HOST", "127.0.0.1")
    port = int(os.environ.get("PORTFOLIO_PORT", "8000"))
    print("Portfolio running at http://%s:%d" % (host, port))
    print("Open /admin for the owner dashboard. First visit will create its password.")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
