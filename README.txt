# Smart Metro Management System

METROX - SMART CHENNAI METRO MANAGEMENT SYSTEM (FRONTEND)

HOW TO OPEN
1. Extract the ZIP.
2. Open auth.html in a browser.
3. Demo logins:
   Regular user -> Email: demo@metrox.com   Password: metrox123
   Admin        -> Email: admin@metrox.com  Password: admin123
   (or click Register to create your own account — new accounts are regular users)

ADMIN ACCESS
- Only the admin account can see and open the Admin Panel link; it is hidden for
  regular users, and a regular user opening admin/admin-dashboard.html directly is
  redirected back to the dashboard.
- Stations added in the Admin Panel are saved to the shared station list and
  immediately appear in Route Finder, Fare Calculator, Travel Time,   QR Ticket and Nearby Station for every user — not just in the admin page.

NEARBY STATION FINDER — MOBILE NOTE
- Browsers (Chrome/Safari on mobile especially) block the GPS/location API on
  pages opened directly from a file (file://) for security. If "Find Stations
  Near Me" cannot get your location, host these files with a simple local server
  or open them over HTTPS, and allow the location permission when prompted.
  Until then, the page shows the nearest stations to Chennai Central as a fallback.

FOLDER STRUCTURE
metro2/
  auth.html/css/js           (each .css and .js file is fully self-contained)
  index.html/css/js          (Dashboard)
  route.html/css/js
  fare.html/css/js
  travel-time.html/css/js
  live-train.html/css/js
  nearby.html/css/js
  ticket.html/css/js
  favorites.html/css/js
  history.html/css/js
  admin/
    admin-dashboard.html/css/js   (admin role only)

FEATURES
- Login & Register (with Forgot Password: SMS OTP or Email OTP recovery, demo simulation)
- Dashboard with quick stats and quick actions
- Route Finder (real Chennai Metro Blue + Green line topology, interchange at both
  Chennai Central and Alandur — the shortest route is picked automatically)
- Metro Line Information (both lines, station by station, tap to favorite)
- Fare Calculator
- Travel Time Estimator
- Live Train Tracking (simulated real-time train positions)
- Nearby Station Finder (uses device GPS location)
- QR Ticket generator (demo)
- Favorites
- Journey History
- Admin Panel (add/remove station records)

FOLDER STRUCTURE
metro1/
  auth.html/css/js           (each .css file is self-contained, no shared.css)
  index.html/css/js          (Dashboard)
  route.html/css/js
  fare.html/css/js
  travel-time.html/css/js
  live-train.html/css/js
  nearby.html/css/js
  ticket.html/css/js
  favorites.html/css/js
  history.html/css/js
  admin/
    admin-dashboard.html/css/js

IMPORTANT
- This is a frontend/demo project. Data is stored in the browser's localStorage.
- SMS/Email OTP recovery, QR ticket and Live Train status are simulated demo features
  (no real SMS/email gateway or live train API is connected).
- For a real deployment, connect a backend (e.g. Spring Boot + MySQL as in the original
  Smart Metro Management System project overview) and real metro data/APIs.

© 2026 Smart Metro Management System


## New modules (Smart Metro Management System)
| Module | Where |
|---|---|
| Admin Login | `auth.html` (admin@metrox.com / admin123) |
| Station Management (add / edit / delete) | Admin → Stations |
| Train Management (details + availability) | Admin → Trains |
| Route Management (source, destination, via stations) | Admin → Routes |
| Schedule Management (timings + frequency) | Admin → Schedules |
| Ticket Booking (date, train, passengers) | Book Ticket |
| Fare Calculation (source/destination based) | Fare Calculator + live fare in Book Ticket |
| Booking History (with cancel) | Booking History |
| Reports (bookings, revenue, passengers, top routes, CSV export) | Admin → Reports |

New SQLite tables: `trains`, `routes`, `schedules`, `bookings` (sample data is seeded on first run).
Background image: `images/metro-bg.svg` - replace it (or change the `url()` in `theme.css`) to use your own metro photo.
