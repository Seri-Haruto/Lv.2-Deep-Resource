# coding: utf-8
# Flaskを使用したWeb形式のLv.2実験サーバ
# Lv.1のPygameロジックを参考にしている

from flask import Flask, request, render_template, jsonify, send_file
import os
import sqlite3
import datetime
import json
import csv
import io

app = Flask(__name__)

# DBの設定
db_path = 'drawing_emotion.db'

def init_db():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS drawings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    user_id TEXT,
                    valence REAL,
                    arousal REAL,
                    points TEXT
                )''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/submit', methods=['POST'])
def submit():
    data = request.get_json()
    timestamp = datetime.datetime.now().isoformat()
    user_id = data.get('user_id', 'anonymous')
    valence = float(data['valence'])
    arousal = float(data['arousal'])
    points = json.dumps(data['points'])

    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('INSERT INTO drawings (timestamp, user_id, valence, arousal, points) VALUES (?, ?, ?, ?, ?)',
            (timestamp, user_id, valence, arousal, points))
    conn.commit()
    conn.close()

    return jsonify({'status': 'success'})

@app.route('/export', methods=['GET'])
def export_csv():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('SELECT * FROM drawings')
    rows = c.fetchall()
    conn.close()

    # メモリ上にCSVを作成
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['id', 'timestamp', 'user_id', 'valence', 'arousal', 'points'])  # ヘッダ
    for row in rows:
        writer.writerow(row)

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),  # Excelで文字化け防止
        mimetype='text/csv',
        as_attachment=True,
        download_name='drawing_emotion_data.csv'
    )

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
