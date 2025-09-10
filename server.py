# coding: utf-8
from flask import Flask, request, render_template, jsonify, redirect, url_for
import os, sqlite3, datetime, json, random, re, secrets, string

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'drawing_emotion.db')

app = Flask(__name__, static_folder='static', template_folder='templates')

# ====== ID 発行・検証 ======
ID_REGEX = re.compile(r'^[A-Za-z0-9]{6,16}$')
def gen_id(length=8):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# ====== DB 初期化 & マイグレーション ======
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('PRAGMA journal_mode=WAL;')

    # 既定テーブル
    c.execute('''CREATE TABLE IF NOT EXISTS drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        user_id TEXT,
        valence INTEGER,
        arousal INTEGER,
        points TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        user_id TEXT UNIQUE,
        consent_version TEXT,
        gender TEXT,
        age_group TEXT,
        handedness TEXT
    )''')
    # 撤回申請
    c.execute('''CREATE TABLE IF NOT EXISTS withdraw_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        user_id TEXT,
        reason TEXT,
        status TEXT
    )''')
    conn.commit()

    # 既存DB向け：不足カラムを追加
    def has_column(table, col):
        c.execute(f"PRAGMA table_info({table})")
        return any(r[1] == col for r in c.fetchall())

    if not has_column('drawings', 'trial_index'):
        c.execute('ALTER TABLE drawings ADD COLUMN trial_index INTEGER')
        conn.commit()

    if not has_column('participants', 'device_type'):
        c.execute('ALTER TABLE participants ADD COLUMN device_type TEXT')
        conn.commit()

    # インデックス
    c.execute('CREATE INDEX IF NOT EXISTS idx_drawings_user ON drawings(user_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_drawings_user_trial ON drawings(user_id, trial_index)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_withdraw_user ON withdraw_requests(user_id)')
    conn.commit()
    conn.close()

# ====== ページ ======
@app.route('/')
def root():
    return redirect(url_for('consent'))

@app.route('/consent')
def consent():
    return render_template('consent.html')

@app.route('/profile')
def profile():
    return render_template('profile.html')

@app.route('/draw')
def draw():
    return render_template('draw.html')

@app.route('/thanks')
def thanks():
    return render_template('thanks.html')

@app.route('/withdraw')
def withdraw():
    return render_template('withdraw.html')

@app.route('/healthz')
def healthz():
    return "ok", 200

# ====== API ======
@app.route('/task', methods=['GET'])
def task():
    return jsonify({"valence": random.randint(-10, 10), "arousal": random.randint(-10, 10)})

@app.route('/issue_id', methods=['GET'])
def issue_id():
    return jsonify({"id": gen_id(8)})

@app.route('/save_profile', methods=['POST'])
def save_profile():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"status":"error","message":"invalid json"}), 400

    user_id = (data.get('user_id') or '').strip()
    consent_version = (data.get('consent_version') or '').strip()
    gender = (data.get('gender') or '').strip()
    age_group = (data.get('age_group') or '').strip()
    handedness = (data.get('handedness') or '').strip()
    device_type = (data.get('device_type') or '').strip()
    consent = data.get('consent', False)

    if not consent:
        return jsonify({"status":"error","message":"consent required"}), 400
    if not ID_REGEX.match(user_id):
        return jsonify({"status":"error","message":"invalid user_id (6-16 alphanumeric)"}), 400

    ts = datetime.datetime.now().isoformat(timespec='seconds')
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT user_id FROM participants WHERE user_id=?', (user_id,))
        exists = c.fetchone() is not None
        if exists:
            c.execute('''UPDATE participants
                         SET consent_version=?, gender=?, age_group=?, handedness=?, device_type=?
                         WHERE user_id=?''',
                      (consent_version, gender, age_group, handedness, device_type, user_id))
        else:
            c.execute('''INSERT INTO participants
                (created_at, user_id, consent_version, gender, age_group, handedness, device_type)
                VALUES (?,?,?,?,?,?,?)''',
                      (ts, user_id, consent_version, gender, age_group, handedness, device_type))
        conn.commit()
    except sqlite3.Error as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        conn.close()

    return jsonify({"status":"success"})

@app.route('/submit', methods=['POST'])
def submit():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"status":"error","message":"invalid json"}), 400

    timestamp = datetime.datetime.now().isoformat(timespec='seconds')
    user_id = (data.get('user_id') or '').strip()
    if not ID_REGEX.match(user_id):
        return jsonify({"status":"error","message":"invalid user_id (6-16 alphanumeric)"}), 400
    try:
        valence = int(data['valence'])
        arousal = int(data['arousal'])
    except (KeyError, ValueError, TypeError):
        return jsonify({"status":"error","message":"invalid valence/arousal"}), 400

    trial_index = data.get('trial_index', None)
    if trial_index is not None:
        try:
            trial_index = int(trial_index)
        except (ValueError, TypeError):
            return jsonify({"status":"error","message":"invalid trial_index"}), 400

    points = data.get('points')
    if not isinstance(points, list) or len(points) < 3:
        return jsonify({"status":"error","message":"points missing or too short"}), 400

    # 軽検証
    for p in points[:5]:
        if not isinstance(p, dict) or 'x' not in p or 'y' not in p:
            return jsonify({"status":"error","message":"invalid point format"}), 400

    points_json = json.dumps(points, ensure_ascii=False, separators=(',',':'))
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''INSERT INTO drawings
            (timestamp,user_id,valence,arousal,trial_index,points)
            VALUES (?,?,?,?,?,?)''',
            (timestamp, user_id, valence, arousal, trial_index, points_json))
        conn.commit()
    except sqlite3.Error as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        conn.close()

    return jsonify({'status':'success'})

@app.route('/withdraw_request', methods=['POST'])
def withdraw_request():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"status":"error","message":"invalid json"}), 400

    user_id = (data.get('user_id') or '').strip()
    reason  = (data.get('reason') or '').strip()
    if not ID_REGEX.match(user_id):
        return jsonify({"status":"error","message":"invalid user_id (6-16 alphanumeric)"}), 400

    ts = datetime.datetime.now().isoformat(timespec='seconds')
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('INSERT INTO withdraw_requests (created_at,user_id,reason,status) VALUES (?,?,?,?)',
                  (ts, user_id, reason, 'pending'))
        conn.commit()
    except sqlite3.Error as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        conn.close()

    return jsonify({"status":"success"})
    
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
