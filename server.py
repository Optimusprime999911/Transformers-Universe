from flask import Flask, request, jsonify, redirect, url_for, send_from_directory, session, render_template_string
from werkzeug.utils import secure_filename
import os
import sqlite3
from datetime import datetime
from functools import wraps

# ============= CONFIG =============
UPLOAD_FOLDER = "uploads"
DB_FILENAME = "transformers.db"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

# Admin passcode (exactly as requested)
ADMIN_PASSCODE = "2014722"

# Secret key for sessions (change for deployment if you like)
SECRET_KEY = os.environ.get("TF_SECRET_KEY", "dev-secret-key-please-change")

# For PythonAnywhere deployment
if os.path.exists("/home/Optimusprime999911"):
    # PythonAnywhere paths
    app.config["UPLOAD_FOLDER"] = "/home/Optimusprime999911/transformers-universe/uploads"
    DB_FILENAME = "/home/Optimusprime999911/transformers-universe/transformers.db"
else:
    # Local development paths
    app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
    DB_FILENAME = "transformers.db"

app = Flask(__name__, static_folder=".", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8 MB max upload
app.secret_key = SECRET_KEY

# ============= HELPERS =============
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db_connection():
    conn = sqlite3.connect(DB_FILENAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transformers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT,
            category TEXT,
            description TEXT,
            image_filename TEXT,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transformer_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            created_at TEXT,
            FOREIGN KEY(transformer_id) REFERENCES transformers(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transformer_id INTEGER NOT NULL,
            author TEXT,
            body TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY(transformer_id) REFERENCES transformers(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY,
            passcode TEXT NOT NULL
        )
    """)
    # Initialize admin passcode if not exists
    existing = conn.execute("SELECT passcode FROM admin WHERE id = 1").fetchone()
    if not existing:
        conn.execute("INSERT INTO admin (id, passcode) VALUES (1, ?)", (ADMIN_PASSCODE,))
    conn.commit()
    conn.close()

def remove_image_file(filename):
    if not filename:
        return
    path = os.path.join(UPLOAD_FOLDER, filename)
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            # if AJAX or API call, return JSON 401, otherwise redirect to login
            if request.path.startswith("/api/") or request.is_json:
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("admin_login", next=request.path))
        return fn(*args, **kwargs)
    return wrapper

def get_admin_passcode():
    """Get the current admin passcode from database"""
    conn = get_db_connection()
    row = conn.execute("SELECT passcode FROM admin WHERE id = 1").fetchone()
    conn.close()
    if row:
        return row["passcode"]
    return ADMIN_PASSCODE  # fallback to hardcoded value

# ============= INITIALIZE =============
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

init_db()

# ============= ROUTES - Public pages =============
@app.route("/")
def home():
    return app.send_static_file("index.html")

@app.route("/compare.html")
def compare_page():
    return app.send_static_file("compare.html")

@app.route("/detail/<int:item_id>")
def detail_page(item_id):
    return app.send_static_file("detail.html")

@app.route("/api/transformers", methods=["GET"])
def list_transformers():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM transformers ORDER BY id DESC").fetchall()
    conn.close()

    transformers = []
    for row in rows:
        transformers.append({
            "id": row["id"],
            "name": row["name"],
            "type": row["type"],
            "category": row["category"],
            "description": row["description"],
            "image_url": f"/uploads/{row['image_filename']}" if row["image_filename"] else None,
            "created_at": row["created_at"]
        })
    return jsonify(transformers)

@app.route("/api/transformers/<int:item_id>", methods=["GET"])
def transformer_detail(item_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM transformers WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "category": row["category"],
        "description": row["description"],
        "image_url": f"/uploads/{row['image_filename']}" if row["image_filename"] else None,
        "image_filename": row["image_filename"],
        "created_at": row["created_at"]
    })

# Ratings API
@app.route("/api/transformers/<int:item_id>/ratings", methods=["GET"])
def get_ratings(item_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT rating FROM ratings WHERE transformer_id = ?", (item_id,)).fetchall()
    conn.close()
    
    if not rows:
        return jsonify({"count": 0, "average": 0})
    
    ratings = [row["rating"] for row in rows]
    average = sum(ratings) / len(ratings)
    return jsonify({"count": len(ratings), "average": average})

@app.route("/api/transformers/<int:item_id>/ratings", methods=["POST"])
def post_rating(item_id):
    conn = get_db_connection()
    # Check transformer exists
    transformer = conn.execute("SELECT id FROM transformers WHERE id = ?", (item_id,)).fetchone()
    if not transformer:
        conn.close()
        return jsonify({"error": "Transformer not found"}), 404
    
    data = request.get_json()
    rating = data.get("rating")
    if not rating or not (1 <= rating <= 5):
        conn.close()
        return jsonify({"error": "Rating must be 1-5"}), 400
    
    conn.execute("""
        INSERT INTO ratings (transformer_id, rating, created_at)
        VALUES (?, ?, ?)
    """, (item_id, rating, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

# Comments API
@app.route("/api/transformers/<int:item_id>/comments", methods=["GET"])
def get_comments(item_id):
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT id, author, body, created_at FROM comments 
        WHERE transformer_id = ? 
        ORDER BY created_at DESC
    """, (item_id,)).fetchall()
    conn.close()
    
    comments = []
    for row in rows:
        comments.append({
            "id": row["id"],
            "author": row["author"],
            "body": row["body"],
            "created_at": row["created_at"]
        })
    return jsonify(comments)

@app.route("/api/transformers/<int:item_id>/comments", methods=["POST"])
def post_comment(item_id):
    conn = get_db_connection()
    # Check transformer exists
    transformer = conn.execute("SELECT id FROM transformers WHERE id = ?", (item_id,)).fetchone()
    if not transformer:
        conn.close()
        return jsonify({"error": "Transformer not found"}), 404
    
    data = request.get_json()
    author = (data.get("author") or "").strip() or "Anonymous"
    body = (data.get("body") or "").strip()
    
    if not body:
        conn.close()
        return jsonify({"error": "Comment body is required"}), 400
    
    conn.execute("""
        INSERT INTO comments (transformer_id, author, body, created_at)
        VALUES (?, ?, ?, ?)
    """, (item_id, author, body, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

# Serve uploaded images
@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# ============= ROUTES - Admin (login + panel) =============
@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    # simple login form - if POST, validate passcode
    if request.method == "POST":
        passcode = request.form.get("passcode", "")
        next_path = request.form.get("next") or url_for("admin_panel")
        current_passcode = get_admin_passcode()
        if passcode == current_passcode:
            session["is_admin"] = True
            return redirect(next_path)
        else:
            # show login page with error
            return render_template_string(LOGIN_HTML, error="Invalid passcode", next=next_path)
    # GET - render login page
    next_path = request.args.get("next", url_for("admin_panel"))
    return render_template_string(LOGIN_HTML, error=None, next=next_path)

@app.route("/admin/logout")
def admin_logout():
    session.pop("is_admin", None)
    return redirect(url_for("home"))

@app.route("/admin/change-password", methods=["POST"])
@admin_required
def change_password():
    """Change the admin passcode"""
    data = request.get_json()
    old_password = data.get("oldPassword", "").strip()
    new_password = data.get("newPassword", "").strip()

    if not old_password or not new_password:
        return jsonify({"error": "All fields are required."}), 400

    current_passcode = get_admin_passcode()
    
    # Verify old password
    if old_password != current_passcode:
        return jsonify({"error": "Current password is incorrect."}), 401

    # Validate new password
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    # Update password in database
    conn = get_db_connection()
    conn.execute("UPDATE admin SET passcode = ? WHERE id = 1", (new_password,))
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "message": "Password changed successfully."})

@app.route("/admin")
@admin_required
def admin_panel():
    # serve admin page (static HTML uses JS to call /api/transformers)
    return app.send_static_file("admin.html")

# ============= ROUTES - Protected CRUD =============
@app.route("/upload")
@admin_required
def upload_page():
    return app.send_static_file("upload.html")

@app.route("/upload", methods=["POST"])
@admin_required
def upload_transformer():
    name = request.form.get("name", "").strip()
    ttype = request.form.get("type", "").strip()
    category = request.form.get("category", "").strip()
    description = request.form.get("description", "").strip()
    image = request.files.get("image")

    if not name:
        return "Name is required", 400

    image_filename = None
    if image and image.filename != "":
        if not allowed_file(image.filename):
            return "Invalid image format", 400
        safe_name = secure_filename(image.filename)
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        image_filename = f"{timestamp}_{safe_name}"
        image.save(os.path.join(UPLOAD_FOLDER, image_filename))

    conn = get_db_connection()
    conn.execute("""
        INSERT INTO transformers (name, type, category, description, image_filename, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        name,
        ttype,
        category,
        description,
        image_filename,
        datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()

    return redirect(url_for("admin_panel"))

@app.route("/edit/<int:item_id>")
@admin_required
def edit_page(item_id):
    return app.send_static_file("edit.html")

@app.route("/edit/<int:item_id>", methods=["POST"])
@admin_required
def edit_transformer(item_id):
    name = request.form.get("name", "").strip()
    ttype = request.form.get("type", "").strip()
    category = request.form.get("category", "").strip()
    description = request.form.get("description", "").strip()
    image = request.files.get("image")

    if not name:
        return "Name is required", 400

    conn = get_db_connection()
    row = conn.execute("SELECT image_filename FROM transformers WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return "Not found", 404

    old_image = row["image_filename"]
    image_filename = old_image

    if image and image.filename != "":
        if not allowed_file(image.filename):
            conn.close()
            return "Invalid image format", 400
        safe_name = secure_filename(image.filename)
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        image_filename = f"{timestamp}_{safe_name}"
        image.save(os.path.join(UPLOAD_FOLDER, image_filename))
        if old_image and old_image != image_filename:
            remove_image_file(old_image)

    conn.execute("""
        UPDATE transformers
        SET name = ?, type = ?, category = ?, description = ?, image_filename = ?
        WHERE id = ?
    """, (name, ttype, category, description, image_filename, item_id))
    conn.commit()
    conn.close()

    return redirect(url_for("admin_panel"))

@app.route("/api/transformers/<int:item_id>", methods=["DELETE"])
@admin_required
def delete_transformer(item_id):
    conn = get_db_connection()
    row = conn.execute("SELECT image_filename FROM transformers WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    image_filename = row["image_filename"]
    conn.execute("DELETE FROM transformers WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    remove_image_file(image_filename)
    return jsonify({"ok": True})

# ============= LOGIN PAGE HTML (rendered with render_template_string) =============
# Very small self-contained template
LOGIN_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin login</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#071028;color:#e6eef7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .box{background:rgba(255,255,255,0.02);padding:22px;border-radius:10px;max-width:420px;width:100%;box-shadow:0 8px 26px rgba(0,0,0,0.6)}
    h2{margin:0 0 10px 0}
    input{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:#e6eef7}
    .muted{color:#94a3b8;font-size:0.95rem;margin-top:8px}
    .error{color:#ff9b9b;margin:8px 0}
    button{margin-top:10px;padding:10px 12px;border-radius:8px;border:none;background:#60a5fa;color:#001;cursor:pointer}
    .small{margin-top:8px;color:#94a3b8;font-size:0.9rem}
  </style>
</head>
<body>
  <div class="box">
    <h2>Admin login</h2>
    {% if error %}<div class="error">{{ error }}</div>{% endif %}
    <form method="post" action="/admin/login">
      <input name="passcode" type="password" placeholder="Enter passcode" autocomplete="off" />
      <input type="hidden" name="next" value="{{ next }}" />
      <button type="submit">Log in</button>
    </form>
    <div class="small muted">Admins can add / edit / delete Transformers here.</div>
  </div>
</body>
</html>
"""

# ============= RUN =============
if __name__ == "__main__":
    app.run(debug=True)
