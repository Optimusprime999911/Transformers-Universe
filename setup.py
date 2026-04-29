#!/usr/bin/env python3
"""
PythonAnywhere deployment setup script for Transformers Universe
Run this once after cloning the repository to set up the database and directories.
"""

import os
import sqlite3
from datetime import datetime

# Configuration
UPLOAD_FOLDER = "uploads"
DB_FILENAME = "transformers.db"
ADMIN_PASSCODE = "2014722"

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect(DB_FILENAME)
    conn.row_factory = sqlite3.Row

    # Create tables
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
    print("Database initialized successfully!")

def setup_directories():
    """Create necessary directories"""
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
        print(f"Created uploads directory: {UPLOAD_FOLDER}")

if __name__ == "__main__":
    print("Setting up Transformers Universe for PythonAnywhere...")
    setup_directories()
    init_db()
    print("Setup complete! Your app is ready to run.")