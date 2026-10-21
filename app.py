import os, json, sqlite3, secrets, time, re, calendar
from datetime import timedelta, date as date_cls
from functools import wraps
from flask import Flask, jsonify, request, session, redirect, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import qr

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'instance', 'metrox.db')
FRONTEND_DIR = BASE_DIR
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get('METROX_SECRET_KEY', 'metrox-college-project-secret-key-change-me')
app.permanent_session_lifetime = timedelta(days=7)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_storage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, key),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS password_otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        otp TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS trains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        line TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 900,
        status TEXT NOT NULL DEFAULT 'Available'
    );
    CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        destination TEXT NOT NULL,
        line TEXT NOT NULL,
        stations TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        train_id INTEGER NOT NULL,
        route_id INTEGER NOT NULL,
        first_train TEXT NOT NULL,
        last_train TEXT NOT NULL,
        frequency INTEGER NOT NULL DEFAULT 10,
        FOREIGN KEY(train_id) REFERENCES trains(id) ON DELETE CASCADE,
        FOREIGN KEY(route_id) REFERENCES routes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        destination TEXT NOT NULL,
        train_id INTEGER,
        travel_date TEXT NOT NULL,
        passengers INTEGER NOT NULL DEFAULT 1,
        fare_per_passenger INTEGER NOT NULL,
        total_fare INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Confirmed',
        payment_method TEXT NOT NULL DEFAULT 'Cash',
        payment_status TEXT NOT NULL DEFAULT 'Paid',
        payment_ref TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    ''')
    conn.commit()
    cols = [r[1] for r in conn.execute('PRAGMA table_info(bookings)').fetchall()]
    for name, ddl in (('payment_method', "TEXT NOT NULL DEFAULT 'Cash'"), ('payment_status', "TEXT NOT NULL DEFAULT 'Paid'"), ('payment_ref', "TEXT NOT NULL DEFAULT ''")):
        if name not in cols:
            conn.execute(f'ALTER TABLE bookings ADD COLUMN {name} {ddl}')
    conn.commit()
    seed_metro_data(conn)
    seed_yellow_line(conn)
    conn.execute("DELETE FROM bookings WHERE ticket_id LIKE 'DMO%'")   # sample data from an older build is not part of real reports
    conn.commit()
    # Seed demo accounts.
    for name, email, phone, password, role in [
        ('Demo User', 'demo@metrox.com', '9999999999', 'metrox123', 'user'),
        ('Admin', 'admin@metrox.com', '8888888888', 'admin123', 'admin'),
    ]:
        exists = conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
        if not exists:
            conn.execute('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)',
                         (name, email, phone, generate_password_hash(password), role))
    conn.commit()
    conn.close()


def seed_yellow_line(conn):
    """Yellow Line (Poonamallee Bypass - Vadapalani, opened 11 Oct 2026): two trains, one route, one timetable."""
    if conn.execute("SELECT COUNT(*) FROM trains WHERE line='Yellow'").fetchone()[0] == 0:
        conn.executemany('INSERT OR IGNORE INTO trains(code,name,line,capacity,status) VALUES(?,?,?,?,?)',
                         [('MX-301', 'Yellow Metro 1', 'Yellow', 900, 'Available'), ('MX-302', 'Yellow Metro 2', 'Yellow', 900, 'Available')])
    if conn.execute("SELECT COUNT(*) FROM routes WHERE line='Yellow'").fetchone()[0] == 0:
        conn.execute('INSERT INTO routes(name,source,destination,line,stations) VALUES(?,?,?,?,?)',
                     ('Yellow Line Full', 'Poonamallee Bypass', 'Vadapalani', 'Yellow', 'Karayanchavadi, Kattupakkam, Porur Junction'))
    tr = conn.execute("SELECT id FROM trains WHERE code='MX-301'").fetchone(); ro = conn.execute("SELECT id FROM routes WHERE name='Yellow Line Full'").fetchone()
    if tr and ro and not conn.execute('SELECT 1 FROM schedules WHERE route_id=?', (ro['id'],)).fetchone():
        conn.execute('INSERT INTO schedules(train_id,route_id,first_train,last_train,frequency) VALUES(?,?,?,?,?)', (tr['id'], ro['id'], '05:00', '23:00', 10))
    # one-time: give the second Yellow train its own timetable too (PRAGMA user_version remembers it was done)
    if conn.execute('PRAGMA user_version').fetchone()[0] < 2:
        t2 = conn.execute("SELECT id FROM trains WHERE code='MX-302'").fetchone()
        if t2 and ro and not conn.execute('SELECT 1 FROM schedules WHERE train_id=?', (t2['id'],)).fetchone():
            conn.execute('INSERT INTO schedules(train_id,route_id,first_train,last_train,frequency) VALUES(?,?,?,?,?)', (t2['id'], ro['id'], '05:05', '23:05', 10))
        conn.execute('PRAGMA user_version=2')
    conn.commit()


def seed_metro_data(conn):
    if conn.execute('SELECT COUNT(*) FROM trains').fetchone()[0] == 0:
        conn.executemany('INSERT INTO trains(code,name,line,capacity,status) VALUES(?,?,?,?,?)', [
            ('MX-101', 'Blue Express 1', 'Blue', 900, 'Available'),
            ('MX-102', 'Blue Express 2', 'Blue', 900, 'Available'),
            ('MX-201', 'Green Shuttle 1', 'Green', 750, 'Available'),
            ('MX-202', 'Green Shuttle 2', 'Green', 750, 'Maintenance'),
        ])
    if conn.execute('SELECT COUNT(*) FROM routes').fetchone()[0] == 0:
        conn.executemany('INSERT INTO routes(name,source,destination,line,stations) VALUES(?,?,?,?,?)', [
            ('Blue Line Full', 'Wimco Nagar', 'Airport', 'Blue', 'Chennai Central, Guindy, Alandur'),
            ('Green Line Full', 'Chennai Central', 'St. Thomas Mount', 'Green', 'Koyambedu, Vadapalani, Alandur'),
        ])
    if conn.execute('SELECT COUNT(*) FROM schedules').fetchone()[0] == 0:
        conn.executemany('INSERT INTO schedules(train_id,route_id,first_train,last_train,frequency) VALUES(?,?,?,?,?)', [
            (1, 1, '05:30', '22:30', 8), (2, 1, '06:00', '22:00', 10), (3, 2, '05:45', '22:15', 12),
        ])
    conn.commit()


def current_user():
    uid = session.get('user_id')
    if not uid:
        return None
    conn = db()
    row = conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    conn.close()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({'ok': False, 'error': 'Login required'}), 401
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({'ok': False, 'error': 'Login required'}), 401
        if user['role'] != 'admin':
            return jsonify({'ok': False, 'error': 'Admin access only'}), 403
        return fn(*args, **kwargs)
    return wrapper


def public_user(row):
    return {'id': row['id'], 'name': row['name'], 'email': row['email'], 'phone': row['phone'], 'role': row['role']}


@app.get('/')
def root():
    return redirect('/auth.html')


@app.post('/api/auth/login')
def api_login():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    conn = db()
    row = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
    conn.close()
    if not row or not check_password_hash(row['password_hash'], password):
        return jsonify({'ok': False, 'error': 'Invalid email or password.'}), 401
    session.permanent = True
    session['user_id'] = row['id']
    return jsonify({'ok': True, 'user': public_user(row)})


@app.post('/api/auth/register')
def api_register():
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    password = data.get('password', '')
    if not name or not email or len(phone) < 10 or len(password) < 4:
        return jsonify({'ok': False, 'error': 'Enter valid details. Password must be 4+ characters.'}), 400
    conn = db()
    if conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
        conn.close()
        return jsonify({'ok': False, 'error': 'An account already exists for this email. Please login instead.'}), 409
    cur = conn.execute('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)',
                       (name, email, phone, generate_password_hash(password), 'user'))
    conn.commit()
    uid = cur.lastrowid
    row = conn.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    conn.close()
    session.permanent = True
    session['user_id'] = uid
    return jsonify({'ok': True, 'user': public_user(row)})


@app.post('/api/auth/logout')
def api_logout():
    session.clear()
    return jsonify({'ok': True})


@app.post('/api/auth/request-otp')
def api_request_otp():
    data = request.get_json(silent=True) or {}
    method = data.get('method')
    value = data.get('value', '').strip().lower()
    conn = db()
    if method == 'sms':
        row = conn.execute('SELECT * FROM users WHERE phone=?', (value,)).fetchone()
    else:
        row = conn.execute('SELECT * FROM users WHERE email=?', (value,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'ok': False, 'error': 'No account found with that contact.'}), 404
    otp = f'{secrets.randbelow(900000) + 100000}'
    expires = int(time.time()) + 600
    conn.execute('DELETE FROM password_otps WHERE user_id=?', (row['id'],))
    conn.execute('INSERT INTO password_otps(user_id,otp,expires_at) VALUES(?,?,?)', (row['id'], otp, expires))
    conn.commit(); conn.close()
    # This is a college-project demo: no real SMS/email is sent.
    return jsonify({'ok': True, 'email': row['email'], 'display': f'SMS to {row["phone"]}' if method == 'sms' else f'email to {row["email"]}', 'demo_otp': otp})


@app.post('/api/auth/reset-password')
def api_reset_password():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()
    password = data.get('password', '')
    if len(password) < 4:
        return jsonify({'ok': False, 'error': 'Password must be at least 4 characters.'}), 400
    conn = db()
    row = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
    record = conn.execute('SELECT * FROM password_otps WHERE user_id=? ORDER BY id DESC LIMIT 1', (row['id'],)).fetchone() if row else None
    if not row or not record or record['otp'] != otp or record['expires_at'] < int(time.time()):
        conn.close()
        return jsonify({'ok': False, 'error': 'Incorrect or expired OTP.'}), 400
    conn.execute('UPDATE users SET password_hash=? WHERE id=?', (generate_password_hash(password), row['id']))
    conn.execute('DELETE FROM password_otps WHERE user_id=?', (row['id'],))
    conn.commit(); conn.close()
    return jsonify({'ok': True})


@app.get('/api/bootstrap')
@login_required
def bootstrap():
    user = current_user()
    conn = db()
    rows = conn.execute('SELECT key,value FROM user_storage WHERE user_id=?', (user['id'],)).fetchall()
    storage = {}
    for row in rows:
        storage[row['key']] = row['value']
    # Stations added by the admin are global: every user must see them.
    shared = conn.execute("SELECT us.value FROM user_storage us JOIN users u ON u.id=us.user_id WHERE us.key='metroAdminStations' AND u.role='admin' ORDER BY us.updated_at DESC, us.id DESC LIMIT 1").fetchone()
    conn.close()
    if shared:
        storage['metroAdminStations'] = shared['value']
    # Safe user directory used only by the original MetroX shell to refresh role/name.
    conn = db()
    users = conn.execute('SELECT name,email,phone,role FROM users').fetchall()
    conn.close()
    safe_users = {r['email']: {'name': r['name'], 'phone': r['phone'], 'role': r['role']} for r in users}
    return jsonify({'ok': True, 'session': public_user(user), 'storage': storage, 'users': safe_users})


@app.post('/api/storage')
@login_required
def save_storage():
    data = request.get_json(silent=True) or {}
    key = data.get('key')
    value = data.get('value')
    allowed = {'metroFavs', 'metroHistory', 'metroAdminStations'}
    if key not in allowed:
        return jsonify({'ok': False, 'error': 'Unsupported storage key'}), 400
    # Station data is global: only an administrator may change it.
    if key == 'metroAdminStations' and current_user()['role'] != 'admin':
        return jsonify({'ok': False, 'error': 'Admin only.'}), 403
    conn = db()
    conn.execute('''INSERT INTO user_storage(user_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP''',
                 (current_user()['id'], key, json.dumps(value) if not isinstance(value, str) else value))
    conn.commit(); conn.close()
    return jsonify({'ok': True})


@app.delete('/api/storage/<key>')
@login_required
def delete_storage(key):
    if key not in {'metroFavs', 'metroHistory', 'metroAdminStations'}:
        return jsonify({'ok': False}), 400
    if key == 'metroAdminStations' and current_user()['role'] != 'admin':
        return jsonify({'ok': False, 'error': 'Admin only.'}), 403
    conn = db(); conn.execute('DELETE FROM user_storage WHERE user_id=? AND key=?', (current_user()['id'], key)); conn.commit(); conn.close()
    return jsonify({'ok': True})


@app.get('/api/session')
def api_session():
    user = current_user()
    return jsonify({'authenticated': bool(user), 'user': public_user(user) if user else None})


# ---------------------------------------------------------------- Metro modules
def rows_to_list(rows):
    return [dict(r) for r in rows]


def clean_fields(data, spec):
    clean = {}
    for key, typ in spec.items():
        val = data.get(key)
        if typ is int:
            try:
                val = int(val)
            except (TypeError, ValueError):
                return None, f'Invalid value for {key}.'
            if val <= 0:
                return None, f'{key} must be greater than 0.'
        else:
            val = str(val).strip() if val is not None else ''
            if not val:
                return None, f'{key} is required.'
        clean[key] = val
    return clean, None


def register_crud(table, spec, list_sql, extra_check=None):
    def list_items():
        conn = db(); rows = conn.execute(list_sql).fetchall(); conn.close()
        return jsonify({'ok': True, 'items': rows_to_list(rows)})

    def save(item_id=None):
        data = request.get_json(silent=True) or {}
        clean, err = clean_fields(data, spec)
        if not err and extra_check:
            err = extra_check(clean)
        if err:
            return jsonify({'ok': False, 'error': err}), 400
        if table == 'routes':
            clean['stations'] = str(data.get('stations', '')).strip()
        conn = db()
        try:
            if item_id is None:
                cols = ','.join(clean); marks = ','.join('?' * len(clean))
                cur = conn.execute(f'INSERT INTO {table}({cols}) VALUES({marks})', list(clean.values()))
                new_id = cur.lastrowid
            else:
                sets = ','.join(f'{k}=?' for k in clean)
                conn.execute(f'UPDATE {table} SET {sets} WHERE id=?', list(clean.values()) + [item_id])
                new_id = item_id
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'ok': False, 'error': 'That train code already exists.'}), 409
        conn.close()
        return jsonify({'ok': True, 'id': new_id})

    def delete_item(item_id):
        conn = db()
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute(f'DELETE FROM {table} WHERE id=?', (item_id,))
        conn.commit(); conn.close()
        return jsonify({'ok': True})

    app.add_url_rule(f'/api/{table}', f'list_{table}', login_required(list_items), methods=['GET'])
    app.add_url_rule(f'/api/{table}', f'create_{table}', admin_required(lambda: save()), methods=['POST'])
    app.add_url_rule(f'/api/{table}/<int:item_id>', f'update_{table}', admin_required(lambda item_id: save(item_id)), methods=['PUT'])
    app.add_url_rule(f'/api/{table}/<int:item_id>', f'delete_{table}', admin_required(delete_item), methods=['DELETE'])


def check_train(c):
    if c['line'] not in ('Blue', 'Green', 'Yellow'):
        return 'Line must be Blue, Green or Yellow.'
    if c['status'] not in ('Available', 'Maintenance', 'Out of Service'):
        return 'Invalid status.'


def check_route(c):
    if c['line'] not in ('Blue', 'Green', 'Yellow'):
        return 'Line must be Blue, Green or Yellow.'
    if c['source'] == c['destination']:
        return 'Source and destination must be different.'


def check_schedule(c):
    for k in ('first_train', 'last_train'):
        if len(c[k]) != 5 or c[k][2] != ':':
            return 'Time must be in HH:MM format.'
    if c['first_train'] >= c['last_train']:
        return 'Last train must be later than first train.'


SCHEDULE_SQL = """SELECT s.*, t.code AS train_code, t.name AS train_name, t.status AS train_status,
                         r.name AS route_name, r.line AS line, r.source AS source, r.destination AS destination
                  FROM schedules s JOIN trains t ON t.id=s.train_id JOIN routes r ON r.id=s.route_id
                  ORDER BY s.first_train"""

register_crud('trains', {'code': str, 'name': str, 'line': str, 'capacity': int, 'status': str},
              'SELECT * FROM trains ORDER BY code', check_train)
register_crud('routes', {'name': str, 'source': str, 'destination': str, 'line': str},
              'SELECT * FROM routes ORDER BY name', check_route)
register_crud('schedules', {'train_id': int, 'route_id': int, 'first_train': str, 'last_train': str, 'frequency': int},
              SCHEDULE_SQL, check_schedule)


BOOKING_SQL = """SELECT b.*, u.name AS passenger_name, u.email AS passenger_email, t.code AS train_code, t.name AS train_name
                 FROM bookings b JOIN users u ON u.id=b.user_id LEFT JOIN trains t ON t.id=b.train_id"""


PAY_METHODS = ('UPI', 'QR', 'Card', 'Cash')


def parse_payment(p):
    """Demo payment check. Card numbers and CVV are never stored, only the last 4 digits."""
    method = str(p.get('method') or '').strip()
    if method not in PAY_METHODS:
        return None, None, 'Choose a payment method: UPI, QR, Card or Cash.'
    if method == 'UPI':
        upi = str(p.get('upi_id') or '').strip()
        if not re.fullmatch(r'[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}', upi):
            return None, None, 'Enter a valid UPI id like name@bank.'
        return method, upi[:2] + '***@' + upi.split('@')[1], None
    if method == 'Card':
        num = re.sub(r'\D', '', str(p.get('card_number') or ''))
        exp = str(p.get('expiry') or '').strip()
        cvv = str(p.get('cvv') or '').strip()
        if not 13 <= len(num) <= 19:
            return None, None, 'Enter a valid card number.'
        m = re.fullmatch(r'(\d{2})/(\d{2})', exp)
        if not m or not 1 <= int(m.group(1)) <= 12 or (2000 + int(m.group(2)), int(m.group(1))) < (date_cls.today().year, date_cls.today().month):
            return None, None, 'Enter a valid card expiry as MM/YY.'
        if not re.fullmatch(r'\d{3,4}', cvv):
            return None, None, 'Enter the 3 or 4 digit CVV.'
        if not str(p.get('card_name') or '').strip():
            return None, None, 'Enter the name on the card.'
        return method, 'Card ending ' + num[-4:], None
    return method, 'QR scan' if method == 'QR' else 'Paid at counter', None


@app.get('/api/qr')
@login_required
def qr_code():
    text = request.args.get('text', '')[:134]
    if not text:
        return jsonify({'ok': False, 'error': 'No text.'}), 400
    try:
        return app.response_class(qr.svg(text), mimetype='image/svg+xml')
    except ValueError as e:
        return jsonify({'ok': False, 'error': str(e)}), 400


@app.post('/api/bookings')
@login_required
def create_booking():
    d = request.get_json(silent=True) or {}
    source, dest = (d.get('source') or '').strip(), (d.get('destination') or '').strip()
    try:
        passengers = int(d.get('passengers', 1)); fare = int(d.get('fare'))
        train_id = d.get('train_id')
        train_id = int(train_id) if train_id not in (None, '', 0) else None
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'Invalid booking details.'}), 400
    date = (d.get('travel_date') or '').strip()
    if not source or not dest or source == dest or not date:
        return jsonify({'ok': False, 'error': 'Choose two different stations and a travel date.'}), 400
    if not 1 <= passengers <= 6:
        return jsonify({'ok': False, 'error': 'You can book 1 to 6 passengers at a time.'}), 400
    if not 10 <= fare <= 50:
        return jsonify({'ok': False, 'error': 'Invalid fare.'}), 400
    method, ref, err = parse_payment(d.get('payment') or {})
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    conn = db()
    if train_id:
        t = conn.execute('SELECT status FROM trains WHERE id=?', (train_id,)).fetchone()
        if not t or t['status'] != 'Available':
            conn.close()
            return jsonify({'ok': False, 'error': 'Selected train is not available.'}), 400
    ticket_id = 'CMT' + str(secrets.randbelow(900000) + 100000)
    conn.execute('''INSERT INTO bookings(ticket_id,user_id,source,destination,train_id,travel_date,passengers,fare_per_passenger,total_fare,payment_method,payment_status,payment_ref)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                 (ticket_id, current_user()['id'], source, dest, train_id, date, passengers, fare, fare * passengers, method, 'Paid', ref))
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'ticket_id': ticket_id, 'total_fare': fare * passengers, 'payment_method': method, 'payment_ref': ref})


@app.get('/api/bookings')
@login_required
def my_bookings():
    conn = db()
    rows = conn.execute(BOOKING_SQL + ' WHERE b.user_id=? ORDER BY b.id DESC', (current_user()['id'],)).fetchall()
    conn.close()
    return jsonify({'ok': True, 'items': rows_to_list(rows)})


@app.post('/api/bookings/<int:booking_id>/cancel')
@login_required
def cancel_booking(booking_id):
    conn = db()
    cur = conn.execute("UPDATE bookings SET status='Cancelled' WHERE id=? AND user_id=? AND status='Confirmed'",
                       (booking_id, current_user()['id']))
    conn.commit(); conn.close()
    if not cur.rowcount:
        return jsonify({'ok': False, 'error': 'Booking not found or already cancelled.'}), 404
    return jsonify({'ok': True})


@app.get('/api/admin/bookings')
@admin_required
def admin_bookings():
    conn = db()
    rows = conn.execute(BOOKING_SQL + ' ORDER BY b.id DESC LIMIT 200').fetchall()
    conn.close()
    return jsonify({'ok': True, 'items': rows_to_list(rows)})


@app.post('/api/admin/bookings/<int:booking_id>/cancel')
@admin_required
def admin_cancel_booking(booking_id):
    conn = db()
    cur = conn.execute("UPDATE bookings SET status='Cancelled' WHERE id=? AND status='Confirmed'", (booking_id,))
    conn.commit(); conn.close()
    if not cur.rowcount:
        return jsonify({'ok': False, 'error': 'Booking not found or already cancelled.'}), 404
    return jsonify({'ok': True})


@app.delete('/api/admin/bookings/<int:booking_id>')
@admin_required
def admin_delete_booking(booking_id):
    conn = db()
    conn.execute('DELETE FROM bookings WHERE id=?', (booking_id,))
    conn.commit(); conn.close()
    return jsonify({'ok': True})


# ---------------------------------------------------------------- Summary
@app.get('/api/summary')
@login_required
def summary():
    conn = db()
    one = lambda q: conn.execute(q).fetchone()[0]
    data = {'trains': one('SELECT COUNT(*) FROM trains'), 'trains_available': one("SELECT COUNT(*) FROM trains WHERE status='Available'"),
            'routes': one('SELECT COUNT(*) FROM routes'), 'schedules': one('SELECT COUNT(*) FROM schedules')}
    conn.close()
    return jsonify({'ok': True, **data})


@app.get('/api/admin/analytics')
@admin_required
def admin_analytics():
    """Daily / weekly / monthly collection and passenger numbers (by travel date, confirmed tickets only)."""
    today = date_cls.today()
    month = request.args.get('month') or today.strftime('%Y-%m')
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        return jsonify({'ok': False, 'error': 'Month must look like 2026-10.'}), 400
    y, m = int(month[:4]), int(month[5:])
    days_in = calendar.monthrange(y, m)[1]
    conn = db()
    agg = "COUNT(*) AS bookings, COALESCE(SUM(passengers),0) AS passengers, COALESCE(SUM(total_fare),0) AS collection"
    rows = {r['day']: dict(r) for r in conn.execute(f"SELECT travel_date AS day, {agg} FROM bookings WHERE status='Confirmed' AND substr(travel_date,1,7)=? GROUP BY travel_date", (month,)).fetchall()}
    zero = {'bookings': 0, 'passengers': 0, 'collection': 0}
    keys = ('bookings', 'passengers', 'collection')
    daily = [dict(day=f'{month}-{d:02d}', **{k: rows.get(f'{month}-{d:02d}', zero)[k] for k in keys}) for d in range(1, days_in + 1)]
    weeks = []
    for w in range(5):
        lo, hi = w * 7 + 1, min(w * 7 + 7, days_in)
        if lo > days_in:
            break
        part = daily[lo - 1:hi]
        weeks.append({'week': w + 1, 'from': lo, 'to': hi, **{k: sum(x[k] for x in part) for k in keys}})

    def peak(key):
        best = max(weeks, key=lambda w: w[key]) if weeks else None
        return best['week'] if best and best[key] > 0 else None
    tot = {k: sum(x[k] for x in daily) for k in keys}
    cancelled = conn.execute("SELECT COUNT(*) FROM bookings WHERE status='Cancelled' AND substr(travel_date,1,7)=?", (month,)).fetchone()[0]
    months = []
    for i in range(11, -1, -1):
        idx = y * 12 + (m - 1) - i
        months.append(f'{idx // 12:04d}-{idx % 12 + 1:02d}')
    mrows = {r['mo']: dict(r) for r in conn.execute(f"SELECT substr(travel_date,1,7) AS mo, {agg} FROM bookings WHERE status='Confirmed' AND substr(travel_date,1,7) BETWEEN ? AND ? GROUP BY mo", (months[0], months[-1])).fetchall()}
    monthly = [dict(month=mo, **{k: mrows.get(mo, zero)[k] for k in keys}) for mo in months]
    prows = {r['payment_method']: dict(r) for r in conn.execute(f"SELECT payment_method, {agg} FROM bookings WHERE status='Confirmed' AND substr(travel_date,1,7)=? GROUP BY payment_method", (month,)).fetchall()}
    modes = [dict(method=k, **{x: prows.get(k, zero)[x] for x in keys}) for k in PAY_METHODS]
    today_row = conn.execute(f"SELECT {agg} FROM bookings WHERE status='Confirmed' AND travel_date=?", (today.isoformat(),)).fetchone()
    conn.close()
    return jsonify({'ok': True, 'month': month, 'today': {'date': today.isoformat(), **dict(today_row)}, 'totals': {**tot, 'cancelled': cancelled},
                    'daily': daily, 'weeks': weeks, 'peak': {'collection': peak('collection'), 'bookings': peak('bookings'), 'passengers': peak('passengers')},
                    'monthly': monthly, 'payment_modes': modes})


@app.get('/api/admin/reports')
@admin_required
def admin_reports():
    conn = db()
    totals = conn.execute("""SELECT COUNT(*) AS bookings,
        COALESCE(SUM(CASE WHEN status='Confirmed' THEN total_fare END),0) AS revenue,
        COALESCE(SUM(CASE WHEN status='Confirmed' THEN passengers END),0) AS passengers,
        COALESCE(SUM(CASE WHEN status='Cancelled' THEN 1 END),0) AS cancelled FROM bookings""").fetchone()
    daily = conn.execute("""SELECT travel_date AS day, COUNT(*) AS bookings, SUM(passengers) AS passengers, SUM(total_fare) AS revenue
        FROM bookings WHERE status='Confirmed' GROUP BY travel_date ORDER BY travel_date DESC LIMIT 7""").fetchall()
    top = conn.execute("""SELECT source, destination, COUNT(*) AS bookings, SUM(passengers) AS passengers, SUM(total_fare) AS revenue
        FROM bookings WHERE status='Confirmed' GROUP BY source, destination ORDER BY bookings DESC LIMIT 5""").fetchall()
    recent = conn.execute(BOOKING_SQL + ' ORDER BY b.id DESC LIMIT 15').fetchall()
    counts = {t: conn.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ('users', 'trains', 'routes', 'schedules')}
    trains_ok = conn.execute("SELECT COUNT(*) FROM trains WHERE status='Available'").fetchone()[0]
    conn.close()
    return jsonify({'ok': True, 'totals': dict(totals), 'daily': rows_to_list(daily)[::-1], 'top_routes': rows_to_list(top),
                    'recent': rows_to_list(recent), 'counts': counts, 'trains_available': trains_ok})


@app.route('/<path:path>')
def frontend(path):
    # API paths are handled above. Everything else is the original MetroX frontend.
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'auth.html')


init_db()

BUILD = '5.1 (13 Oct 2026)'


@app.after_request
def no_stale_files(resp):
    """Pages, scripts and styles must always come fresh from this server (a browser keeping an old copy hides new features)."""
    if request.path.endswith(('.html', '.js', '.css', '.svg', '.jpg')) or request.path in ('/', ''):
        resp.headers['Cache-Control'] = 'no-store, max-age=0'
    return resp


@app.get('/api/version')
def version():
    return jsonify({'ok': True, 'build': BUILD})


if __name__ == '__main__':
    import socket
    port = int(os.environ.get('PORT', 5000))
    probe = socket.socket(); probe.settimeout(0.5)
    if probe.connect_ex(('127.0.0.1', port)) == 0:
        print(f'\nPORT {port} IS ALREADY IN USE: an OLD MetroX server is still running, so you would see the OLD version.')
        print('Close the old "MetroX Server" window (or restart the PC) and run again.\n')
        try:
            input('Press Enter to exit...')
        except EOFError:
            pass
        raise SystemExit(1)
    probe.close()
    print(f'Smart Metro Management System, build {BUILD}')
    app.run(host='0.0.0.0', port=port, debug=False)
