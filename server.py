# coding: utf-8
from flask import Flask, request, render_template, jsonify, send_file
import os
import sqlite3
import datetime
import json
import csv
import io
import random
import re
import secrets
import string

app = Flask(__name__, static_folder='static', template_folder='templates')

# ====== ID 発行・検証 ======
ID_REGEX = re.compile(r'^[A-Za-z0-9]{6,16}$')

def gen_id(length=8):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# ====== DB ======
DB_PATH = 'drawing_emotion.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS drawings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    user_id TEXT,
                    valence INTEGER,
                    arousal INTEGER,
                    points TEXT
                )''')
    conn.commit()
    conn.close()

# ====== UI ======
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/healthz')
def healthz():
    return "ok", 200

# ====== お題API ======
@app.route('/task', methods=['GET'])
@app.route('/get_task', methods=['GET'])  # 互換
def task():
    valence = random.randint(-10, 10)
    arousal = random.randint(-10, 10)
    return jsonify({"valence": valence, "arousal": arousal})

# ====== 参加者ID発行 ======
@app.route('/issue_id', methods=['GET'])
def issue_id():
    new_id = gen_id(8)
    return jsonify({"id": new_id})

# ====== 提出 ======
@app.route('/submit', methods=['POST'])
def submit():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"status": "error", "message": "invalid json"}), 400

    timestamp = datetime.datetime.now().isoformat(timespec='seconds')

    user_id = (data.get('user_id') or '').strip()
    if not ID_REGEX.match(user_id):
        return jsonify({"status": "error", "message": "invalid user_id (6-16 alphanumeric)"}), 400

    try:
        valence = int(data['valence'])
        arousal = int(data['arousal'])
    except (KeyError, ValueError, TypeError):
        return jsonify({"status": "error", "message": "invalid valence/arousal"}), 400

    points = data.get('points')
    if not isinstance(points, list) or len(points) == 0:
        return jsonify({"status": "error", "message": "points missing"}), 400

    points_json = json.dumps(points, ensure_ascii=False, separators=(',', ':'))

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            'INSERT INTO drawings (timestamp, user_id, valence, arousal, points) VALUES (?, ?, ?, ?, ?)',
            (timestamp, user_id, valence, arousal, points_json)
        )
        conn.commit()
    except sqlite3.Error as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()

    return jsonify({'status': 'success'})

# ====== CSVエクスポート ======
@app.route('/export', methods=['GET'])
def export_csv():
    user_id = request.args.get('user_id', '', type=str).strip()

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if user_id:
        c.execute('SELECT id, timestamp, user_id, valence, arousal, points FROM drawings WHERE user_id = ? ORDER BY id ASC', (user_id,))
    else:
        c.execute('SELECT id, timestamp, user_id, valence, arousal, points FROM drawings ORDER BY id ASC')

    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['id', 'timestamp', 'user_id', 'valence', 'arousal', 'points'])
    for row in rows:
        writer.writerow(row)

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=('drawing_emotion_data.csv' if not user_id else f'drawing_emotion_{user_id}.csv')
    )

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 10000)) 
    app.run(host='0.0.0.0', port=port, debug=False)


