import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

async function api(path, options = {}) {
  const token = localStorage.getItem("classroom-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function SignIn({ onSignIn }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setSent(true);
      setMessage(result.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code, name }),
      });
      localStorage.setItem("classroom-token", result.token);
      onSignIn(result.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="signin-card">
      <span className="eyebrow">A better place to learn</span>
      <h1>Room for<br /><em>good ideas.</em></h1>
      <p className="intro">Book a classroom in a few easy steps. Sign in with your phone to get started.</p>
      <form onSubmit={sent ? verifyCode : requestCode}>
        <label htmlFor="phone">Phone number</label>
        <input id="phone" type="tel" autoComplete="tel" placeholder="+15551234567" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        {sent && (
          <>
            <label htmlFor="name">Your name <span>(new accounts)</span></label>
            <input id="name" autoComplete="name" placeholder="Alex Morgan" value={name} onChange={(event) => setName(event.target.value)} />
            <label htmlFor="code">One-time code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter your code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </>
        )}
        {message && <p className="form-message" role="status">{message}</p>}
        <button className="primary-button" disabled={busy}>
          {busy ? "Please wait…" : sent ? "Verify & continue" : "Send me a code"}
          {!busy && <span aria-hidden="true">↗</span>}
        </button>
        {sent && <button className="text-button" type="button" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Use a different number</button>}
      </form>
      <p className="privacy-note">One-time codes are sent securely by Minimoth.</p>
    </section>
  );
}

function Bookings({ user, onSignOut }) {
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState({ classroom: "", date: "", start_time: "09:00", end_time: "10:00", purpose: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadBookings() {
    try {
      const result = await api("/bookings");
      setBookings(result.bookings);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => { loadBookings(); }, []);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function createBooking(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/bookings", { method: "POST", body: JSON.stringify(form) });
      setMessage("Your classroom is booked.");
      setForm({ classroom: "", date: "", start_time: "09:00", end_time: "10:00", purpose: "" });
      await loadBookings();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking(id) {
    setMessage("");
    try {
      await api(`/bookings/${id}`, { method: "DELETE" });
      await loadBookings();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="booking-page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Classroom Booking home"><span className="brand-mark">C</span> roomnote</a>
        <div className="account"><span>Welcome, {user.name}</span><button className="text-button" onClick={onSignOut}>Sign out</button></div>
      </header>
      <section className="welcome">
        <span className="eyebrow">YOUR CAMPUS, MADE SIMPLE</span>
        <h1>Make space<br /><em>for learning.</em></h1>
        <p>Find your room. Gather your people. Make something happen.</p>
      </section>
      <div className="booking-layout">
        <section className="panel booking-form-panel">
          <div className="panel-heading"><div><span className="eyebrow">A NEW SESSION</span><h2>Book a room</h2></div><span className="heading-icon">✳</span></div>
          <form className="booking-form" onSubmit={createBooking}>
            <label htmlFor="classroom">Classroom</label>
            <input id="classroom" name="classroom" placeholder="e.g. Studio 204" value={form.classroom} onChange={update} maxLength="80" required />
            <label htmlFor="purpose">What’s the occasion?</label>
            <input id="purpose" name="purpose" placeholder="e.g. Design study group" value={form.purpose} onChange={update} maxLength="200" required />
            <label htmlFor="date">Date</label>
            <input id="date" type="date" name="date" min={new Date().toLocaleDateString("en-CA")} value={form.date} onChange={update} required />
            <div className="time-fields">
              <div><label htmlFor="start_time">Starts</label><input id="start_time" type="time" name="start_time" value={form.start_time} onChange={update} required /></div>
              <div><label htmlFor="end_time">Ends</label><input id="end_time" type="time" name="end_time" value={form.end_time} onChange={update} required /></div>
            </div>
            {message && <p className="form-message" role="status">{message}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "Booking…" : "Confirm booking"} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
        <section className="panel schedule-panel">
          <div className="panel-heading"><div><span className="eyebrow">YOUR PLANS</span><h2>Upcoming bookings</h2></div><span className="booking-count">{bookings.length}</span></div>
          {bookings.length ? (
            <ul className="booking-list">
              {bookings.map((booking) => (
                <li className="booking-item" key={booking.id}>
                  <div className="date-badge"><span>{new Date(`${booking.date}T12:00`).toLocaleDateString("en", { month: "short" })}</span><strong>{new Date(`${booking.date}T12:00`).getDate()}</strong></div>
                  <div className="booking-details"><strong>{booking.classroom}</strong><span>{booking.purpose}</span><small>{booking.start_time} – {booking.end_time}</small></div>
                  <button className="cancel-button" onClick={() => cancelBooking(booking.id)} aria-label={`Cancel booking for ${booking.classroom}`}>×</button>
                </li>
              ))}
            </ul>
          ) : <div className="empty-state"><span>◷</span><p>No rooms booked just yet.<br />Your next idea starts here.</p></div>}
        </section>
      </div>
      <footer>Made for the moments that matter <span>✳</span></footer>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("classroom-user"));
    } catch {
      return null;
    }
  });

  function signOut() {
    localStorage.removeItem("classroom-token");
    localStorage.removeItem("classroom-user");
    setUser(null);
  }

  function signIn(nextUser) {
    localStorage.setItem("classroom-user", JSON.stringify(nextUser));
    setUser(nextUser);
  }

  return user ? <Bookings user={user} onSignOut={signOut} /> : (
    <main className="auth-page">
      <div className="auth-art">
        <a className="brand" href="/"><span className="brand-mark">C</span> roomnote</a>
        <div className="art-caption"><span>01 / 03</span><p>A little room<br />to think bigger.</p></div>
        <div className="art-circle circle-one" /><div className="art-circle circle-two" />
      </div>
      <SignIn onSignIn={signIn} />
      <span className="page-note">CLASSROOM BOOKING SYSTEM <span>·</span> 2026</span>
    </main>
  );
}
