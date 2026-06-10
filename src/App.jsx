import { useState, useMemo, useEffect, useRef } from "react";
import PROFILE_PIC from "./assets/SCET_pic.jpeg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = import.meta.env.VITE_APP_PASSWORD || "mahi2025";


const INITIAL_STATS = {
  matches:    parseInt(import.meta.env.VITE_INITIAL_MATCHES    || "0"),
  runs:       parseInt(import.meta.env.VITE_INITIAL_RUNS       || "0"),
  dismissals: parseInt(import.meta.env.VITE_INITIAL_DISMISSALS || "0"),
  balls:      parseInt(import.meta.env.VITE_INITIAL_BALLS      || "0"),
};
const TARGET_SR = parseFloat(import.meta.env.VITE_TARGET_SR  || "150");
const TARGET_AVG = parseFloat(import.meta.env.VITE_TARGET_AVG || "30");
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "",
      ...options.headers,
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function StatBadge({ label, value, color, textColor }) {
  return (
    <div style={{ background: color, borderRadius: 12, padding: "14px 20px", minWidth: 110, textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: textColor || "#fff", letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function ProgressArc({ value, target, label, color }) {
  const pct = Math.min(value / target, 1);
  const r = 44, circ = 2 * Math.PI * r, dash = pct * circ, over = value > target;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="#1e293b" strokeWidth={9} />
        <circle cx={55} cy={55} r={r} fill="none" stroke={over ? "#22c55e" : color} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={55} y={52} textAnchor="middle" fill={over ? "#22c55e" : "#f8fafc"} fontSize={15} fontWeight={800}>{value.toFixed(2)}</text>
        <text x={55} y={67} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={9} fontWeight={600}>{String("/ " + target)}</text>
      </svg>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 700, marginTop: -4, letterSpacing: 0.4 }}>{label}</div>
      {over && <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 800, marginTop: 2 }}>✓ TARGET HIT</div>}
    </div>
  );
}

// ── CONFIRM DIALOG ──────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24,
    }}>
      <div style={{
        background: "#1e293b", borderRadius: 18, padding: "28px 24px",
        maxWidth: 320, width: "100%", border: "1px solid #334155", textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>Remove Innings?</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #334155",
            background: "transparent", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "11px", borderRadius: 10, border: "none",
            background: "linear-gradient(90deg,#dc2626,#b91c1c)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Yes, Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── PHOTO LIGHTBOX ───────────────────────────────────────────
function PhotoLightbox({ onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: 380, width: "100%" }}>
        <img src={PROFILE_PIC} alt="Mahi" style={{
          width: "100%", borderRadius: 18, border: "3px solid #3b82f6", display: "block",
        }} />
        <button onClick={onClose} style={{
          position: "absolute", top: -14, right: -14, width: 32, height: 32,
          borderRadius: "50%", background: "#ef4444", border: "none",
          color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
      </div>
    </div>
  );
}

// ── PASSWORD SCREEN ──────────────────────────────────────────
function PasswordScreen({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockout, setLockout] = useState(0);
  const [showPhoto, setShowPhoto] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (lockout > 0) {
      timerRef.current = setInterval(() => {
        setLockout(l => { if (l <= 1) { clearInterval(timerRef.current); return 0; } return l - 1; });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [lockout > 0 && lockout === LOCKOUT_SECONDS]);

  function tryUnlock() {
    if (lockout > 0) return;
    if (pw === PASSWORD) { onUnlock(); return; }
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setShake(true); setWrong(true); setPw("");
    setTimeout(() => setShake(false), 500);
    if (newAttempts >= MAX_ATTEMPTS) {
      setLockout(LOCKOUT_SECONDS);
      setAttempts(0);
    }
  }

  const isLocked = lockout > 0;

  return (
    <>
      {showPhoto && <PhotoLightbox onClose={() => setShowPhoto(false)} />}
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0f172a 0%,#1a1f35 60%,#0f172a 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter','Segoe UI',sans-serif", padding: 24,
      }}>
        <div onClick={() => setShowPhoto(true)} style={{
          width: 90, height: 90, borderRadius: "50%", overflow: "hidden",
          border: "3px solid #3b82f6", marginBottom: 16, cursor: "pointer",
          transition: "transform 0.2s, box-shadow 0.2s",
          boxShadow: "0 0 0 0 #3b82f6",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.07)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(59,130,246,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <img src={PROFILE_PIC} alt="Mahi" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", marginBottom: 4 }}>MAHI STATS TRACKER</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 32 }}>Enter password to continue</div>

        <div style={{
          background: "#1e293b", borderRadius: 20, padding: "28px 24px",
          width: "100%", maxWidth: 340, border: `1px solid ${isLocked ? "#ef4444" : "#334155"}`,
          animation: shake ? "shake 0.4s ease" : "none",
        }}>
          <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}`}</style>

          {isLocked ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444", marginBottom: 6 }}>Too many wrong attempts!</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>Try again in</div>
              <div style={{
                fontSize: 42, fontWeight: 900, color: "#f97316",
                fontVariantNumeric: "tabular-nums",
              }}>{lockout}s</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 8 }}>PASSWORD</div>
              <input type="password" value={pw}
                onChange={e => { setPw(e.target.value); setWrong(false); }}
                onKeyDown={e => e.key === "Enter" && tryUnlock()}
                placeholder="Enter password" autoFocus
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  border: `1px solid ${wrong ? "#ef4444" : "#334155"}`,
                  background: "#0f172a", color: "#f8fafc", fontSize: 16,
                  outline: "none", boxSizing: "border-box", marginBottom: wrong ? 8 : 16,
                }}
              />
              {wrong && (
                <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>
                  Wrong password — {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} left
                </div>
              )}
              <button onClick={tryUnlock} style={{
                width: "100%", padding: "13px", borderRadius: 12,
                background: "linear-gradient(90deg,#2563eb,#1d4ed8)",
                color: "#fff", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer",
              }}>Unlock 🔓</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────
export default function MahiTracker() {
  const [unlocked, setUnlocked] = useState(false);
  const [innings, setInnings] = useState([]);
  const [runs, setRuns] = useState("");
  const [balls, setBalls] = useState("");
  const [dismissed, setDismissed] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dbError, setDbError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, runs, balls }
  const [showPhoto, setShowPhoto] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true); setDbError("");
    sbFetch("innings?select=*&order=created_at.asc")
      .then(data => setInnings(data || []))
      .catch(() => setDbError("⚠️ Could not connect to database. Check your Supabase keys."))
      .finally(() => setLoading(false));
  }, [unlocked]);

  const cumulative = useMemo(() => {
    const totalRuns = innings.reduce((s, i) => s + i.runs, INITIAL_STATS.runs);
    const totalBalls = innings.reduce((s, i) => s + i.balls, INITIAL_STATS.balls);
    const totalDismissals = innings.reduce((s, i) => s + (i.dismissed ? 1 : 0), INITIAL_STATS.dismissals);
    const totalMatches = INITIAL_STATS.matches + innings.length;
    const sr = totalBalls > 0 ? (totalRuns / totalBalls) * 100 : 0;
    const avg = totalDismissals > 0 ? totalRuns / totalDismissals : totalRuns;
    return { totalRuns, totalBalls, totalDismissals, totalMatches, sr, avg };
  }, [innings]);

  const projection = useMemo(() => {
    const idealSR = 220, idealRuns = 50, idealBalls = Math.round((idealRuns / idealSR) * 100);
    let sR = cumulative.totalRuns, sB = cumulative.totalBalls, sD = cumulative.totalDismissals, n = 0;
    while (n < 200) {
      if ((sR / sB) * 100 >= TARGET_SR && sR / sD >= TARGET_AVG) break;
      sR += idealRuns; sB += idealBalls; sD += 1; n++;
    }
    return n;
  }, [cumulative]);

  async function addInning() {
    const r = parseInt(runs), b = parseInt(balls);
    if (!r || !b || r < 0 || b <= 0) { setError("Enter valid runs and balls."); return; }
    setError(""); setSyncing(true);
    try {
      const result = await sbFetch("innings", { method: "POST", prefer: "return=representation", body: JSON.stringify({ runs: r, balls: b, dismissed }) });
      setInnings(prev => [...prev, result[0] || { runs: r, balls: b, dismissed, id: Date.now() }]);
      setRuns(""); setBalls(""); setDismissed(true);
    } catch { setError("Failed to save. Check your internet or Supabase keys."); }
    setSyncing(false);
  }

  async function confirmRemove() {
    if (!confirmDelete) return;
    setSyncing(true);
    try {
      await sbFetch(`innings?id=eq.${confirmDelete.id}`, { method: "DELETE" });
      setInnings(prev => prev.filter(i => i.id !== confirmDelete.id));
    } catch { setError("Failed to delete."); }
    setConfirmDelete(null); setSyncing(false);
  }

  if (!unlocked) return <PasswordScreen onUnlock={() => setUnlocked(true)} />;

  return (
    <>
      {confirmDelete && (
        <ConfirmDialog
          message={`Remove innings of ${confirmDelete.runs} runs off ${confirmDelete.balls} balls?`}
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {showPhoto && <PhotoLightbox onClose={() => setShowPhoto(false)} />}

      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0f172a 0%,#1a1f35 60%,#0f172a 100%)",
        fontFamily: "'Inter','Segoe UI',sans-serif", color: "#f8fafc", padding: "0 0 40px",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(90deg,#1e3a5f 0%,#1e293b 100%)",
          borderBottom: "2px solid #3b82f6", padding: "18px 20px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div onClick={() => setShowPhoto(true)} style={{
            width: 52, height: 52, borderRadius: "50%", overflow: "hidden",
            border: "2.5px solid #3b82f6", flexShrink: 0, cursor: "pointer",
            transition: "transform 0.2s",
          }}
            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >
            <img src={PROFILE_PIC} alt="Mahi" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Batting Stats</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Target · SR 150+ · AVG 30+ · RHB</div>
          </div>
          {syncing && <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>⟳ Saving...</div>}
          <button onClick={() => setUnlocked(false)} style={{
            background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8,
            color: "#94a3b8", fontSize: 18, cursor: "pointer", padding: "6px 10px",
          }}>🔒</button>
        </div>

        <div style={{ padding: "20px 16px 0" }}>
          {dbError && (
            <div style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid #ef4444",
              borderRadius: 12, padding: "12px 16px", marginBottom: 16,
              color: "#f87171", fontSize: 13, fontWeight: 600,
            }}>{dbError}</div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "#64748b", fontSize: 14 }}>⏳ Loading your innings...</div>
          ) : (
            <>
              {/* Progress rings */}
              <div style={{
                background: "#1e293b", borderRadius: 16, padding: "20px 16px",
                display: "flex", justifyContent: "space-around", alignItems: "center",
                marginBottom: 16, border: "1px solid #334155",
              }}>
                <ProgressArc value={cumulative.sr} target={TARGET_SR} label="STRIKE RATE" color="#f97316" />
                <div style={{ width: 1, background: "#334155", height: 80 }} />
                <ProgressArc value={cumulative.avg} target={TARGET_AVG} label="AVERAGE" color="#3b82f6" />
              </div>

              {/* Stats — RUNS is green */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <StatBadge label="MATCHES" value={cumulative.totalMatches} color="#1e40af" />
                <StatBadge label="RUNS" value={cumulative.totalRuns} color="#14532d" textColor="#22c55e" />
                <StatBadge label="OUTS" value={cumulative.totalDismissals} color="#991b1b" />
              </div>

              {/* Projection */}
              <div style={{
                background: projection === 0 ? "linear-gradient(90deg,#14532d,#166534)" : "linear-gradient(90deg,#1e293b,#1a2744)",
                border: `1px solid ${projection === 0 ? "#22c55e" : "#3b82f6"}`,
                borderRadius: 14, padding: "14px 18px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{ fontSize: 36 }}>{projection === 0 ? "🎉" : "🎯"}</div>
                <div>
                  {projection === 0 ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>Both targets achieved!</div>
                      <div style={{ fontSize: 12, color: "#86efac" }}>SR 150+ and AVG 30+ — well done Mahi!</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>AT IDEAL PACE (50 runs @ SR 220)</div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>~{projection} more innings to hit both targets</div>
                    </>
                  )}
                </div>
              </div>

              {/* Log innings */}
              <div style={{ background: "#1e293b", borderRadius: 16, padding: "18px 16px", border: "1px solid #334155", marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 14 }}>+ LOG AN INNINGS</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>RUNS</div>
                    <input type="number" value={runs} onChange={e => setRuns(e.target.value)} placeholder="e.g. 47"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#f8fafc", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>BALLS FACED</div>
                    <input type="number" value={balls} onChange={e => setBalls(e.target.value)} placeholder="e.g. 22"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#f8fafc", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <button onClick={() => setDismissed(d => !d)} style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `2px solid ${dismissed ? "#ef4444" : "#22c55e"}`,
                    background: dismissed ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                    color: dismissed ? "#ef4444" : "#22c55e", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>{dismissed ? "OUT" : "NOT OUT"}</button>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Tap to toggle</span>
                </div>
                {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{error}</div>}
                <button onClick={addInning} disabled={syncing} style={{
                  width: "100%", padding: "13px", borderRadius: 12,
                  background: syncing ? "#1e3a5f" : "linear-gradient(90deg,#2563eb,#1d4ed8)",
                  color: "#fff", fontWeight: 800, fontSize: 15, border: "none", cursor: syncing ? "not-allowed" : "pointer",
                }}>{syncing ? "Saving to database..." : "Add Innings"}</button>
              </div>

              {/* Innings log */}
              {innings.length > 0 && (
                <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px", border: "1px solid #334155" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>INNINGS LOG</div>
                  {innings.map((inn, i) => {
                    const sr = ((inn.runs / inn.balls) * 100).toFixed(1);
                    const good = parseFloat(sr) >= 150;
                    return (
                      <div key={inn.id || i} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 0", borderBottom: i < innings.length - 1 ? "1px solid #1e3a5f" : "none",
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", background: "#0f172a",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: "#64748b",
                        }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{inn.runs}</span>
                          <span style={{ color: "#64748b", fontSize: 12 }}> runs off </span>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{inn.balls}</span>
                          <span style={{ color: "#64748b", fontSize: 12 }}> balls</span>
                          {!inn.dismissed && <span style={{ marginLeft: 6, fontSize: 11, color: "#22c55e", fontWeight: 700 }}>NOT OUT</span>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: good ? "#22c55e" : "#f97316", minWidth: 54, textAlign: "right" }}>SR {sr}</div>
                        <button
                          onClick={() => setConfirmDelete({ id: inn.id, runs: inn.runs, balls: inn.balls })}
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: 14, padding: "3px 8px", fontWeight: 700 }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}