import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabase = createClient("https://xmetukxqsbkfgmggmtch.supabase.co", "sb_publishable_Rp0FGtaOU68VmkWHKg7VMA_LdrTs4AL", {
  auth: { persistSession: true, autoRefreshToken: true }
});

const YEAR = 2026;
const months = ["Januar","Februar","Marec","April","Maj","Junij","Julij","Avgust","September","Oktober","November","December"];
const dayNames = ["nedelja","ponedeljek","torek","sreda","četrtek","petek","sobota"];
const holidays = {
  "2026-01-01":"Novo leto",
  "2026-01-02":"Novo leto",
  "2026-02-08":"Prešernov dan",
  "2026-04-05":"Velika noč",
  "2026-04-06":"Velikonočni ponedeljek",
  "2026-04-27":"Dan upora proti okupatorju",
  "2026-05-01":"Praznik dela",
  "2026-05-02":"Praznik dela",
  "2026-06-25":"Dan državnosti",
  "2026-08-15":"Marijino vnebovzetje",
  "2026-10-31":"Dan reformacije",
  "2026-11-01":"Dan spomina na mrtve",
  "2026-12-25":"Božič",
  "2026-12-26":"Dan samostojnosti in enotnosti"
};

const emptyData = () => ({
  settings: { normHours: "8:00", vacationStart: 25, startBalance: "0:00" },
  days: {}
});

function pad(n) { return String(n).padStart(2, "0"); }
function makeKey(m, d) { return `${YEAR}-${pad(m + 1)}-${pad(d)}`; }
function daysInMonth(m) { return new Date(YEAR, m + 1, 0).getDate(); }

function parseHours(v) {
  if (v === undefined || v === null || String(v).trim() === "") return 0;
  v = String(v).trim().replace(",", ".");
  if (v.includes(":")) {
    const [h, min] = v.split(":");
    return (Number(h) || 0) + (Number(min) || 0) / 60;
  }
  return Number(v) || 0;
}

function fmtHours(x) {
  const sign = x < 0 ? "-" : "";
  x = Math.abs(x);
  let h = Math.floor(x);
  let m = Math.round((x - h) * 60);
  if (m === 60) { h++; m = 0; }
  return `${sign}${h}:${pad(m)}`;
}

function defaultType(k) { return holidays[k] ? "praznik" : "delo"; }
function defaultDay(k) { return { work: "", overtime: "", type: defaultType(k), note: "" }; }

function touched(day, k) {
  const def = defaultType(k);
  return Boolean(
    String(day.work || "").trim() ||
    String(day.overtime || "").trim() ||
    String(day.note || "").trim() ||
    day.type !== def
  );
}

function App() {
  const currentMonth = new Date().getFullYear() === YEAR ? new Date().getMonth() : 6;
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem("mojeUre2026Final");
      return saved ? JSON.parse(saved) : emptyData();
    } catch {
      return emptyData();
    }
  });

  const [session, setSession] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [sync, setSync] = useState("Prijava ni aktivna");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMsg, setAuthMsg] = useState("Prijavi se z istim računom na telefonu in računalniku.");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setCloudLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRecordId(null);
        setSync("Prijava ni aktivna");
        setCloudLoaded(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadCloud();
  }, [session]);

  useEffect(() => {
    localStorage.setItem("mojeUre2026Final", JSON.stringify(data));

    if (!session || !cloudLoaded) return;

    clearTimeout(saveTimer.current);
    setSync("Shranjujem ...");
    saveTimer.current = setTimeout(() => {
      saveCloud(data);
    }, 800);

    return () => clearTimeout(saveTimer.current);
  }, [data, session, cloudLoaded]);

  async function signUp() {
    if (!email || !password) {
      setAuthMsg("Vpiši e-pošto in geslo.");
      return;
    }
    setAuthMsg("Ustvarjam račun ...");
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthMsg(error ? "Napaka: " + error.message : "Račun ustvarjen. Če je potrebno, potrdi e-pošto, nato klikni Prijava.");
  }

  async function signIn() {
    if (!email || !password) {
      setAuthMsg("Vpiši e-pošto in geslo.");
      return;
    }
    setAuthMsg("Prijavljam ...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthMsg("Napaka: " + error.message);
    else setAuthMsg("Prijavljen.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setRecordId(null);
    setCloudLoaded(true);
  }

  async function loadCloud() {
    if (!session) return;
    setCloudLoaded(false);
    setSync("Berem iz oblaka ...");

    const res = await supabase
      .from("work_hours_2026")
      .select("id,data,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (res.error) {
      setSync("Napaka: " + res.error.message);
      setCloudLoaded(true);
      return;
    }

    if (res.data && res.data.length > 0) {
      setRecordId(res.data[0].id);
      setData(res.data[0].data || emptyData());
      setSync("Sinhronizirano " + new Date(res.data[0].updated_at).toLocaleTimeString("sl-SI"));
    } else {
      setRecordId(null);
      setSync("Oblak je prazen. Prvi vnos bo ustvaril evidenco.");
    }

    setCloudLoaded(true);
  }

  async function saveCloud(nextData) {
    if (!session) return;

    const payload = { data: nextData, updated_at: new Date().toISOString() };
    let res;

    if (recordId) {
      res = await supabase.from("work_hours_2026").update(payload).eq("id", recordId);
    } else {
      res = await supabase.from("work_hours_2026").insert(payload).select("id").single();
      if (res.data?.id) setRecordId(res.data.id);
    }

    if (res.error) setSync("Napaka: " + res.error.message);
    else setSync("Sinhronizirano " + new Date().toLocaleTimeString("sl-SI"));
  }

  function getDay(k) {
    return data.days?.[k] || defaultDay(k);
  }

  function updateDay(k, field, value) {
    setData(prev => ({
      ...prev,
      days: {
        ...(prev.days || {}),
        [k]: { ...(prev.days?.[k] || defaultDay(k)), [field]: value }
      }
    }));
  }

  function updateSetting(field, value) {
    setData(prev => ({
      ...prev,
      settings: { ...(prev.settings || emptyData().settings), [field]: value }
    }));
  }

  const totals = useMemo(() => {
    const settings = data.settings || emptyData().settings;
    const norm = parseHours(settings.normHours || "8:00");
    const vacationStart = Number(settings.vacationStart || 0);

    let yWork = 0, yHoliday = 0, yOver = 0, vac = 0, sick = 0;
    let mWork = 0, mHoliday = 0, mOver = 0, mVac = 0, mSick = 0;

    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= daysInMonth(m); d++) {
        const k = makeKey(m, d);
        const day = getDay(k);

        let work = 0;
        let holidayHours = 0;
        const overtime = parseHours(day.overtime);

        if (day.type === "delo") work = parseHours(day.work);
        if (day.type === "praznik") holidayHours = norm;

        yWork += work;
        yHoliday += holidayHours;
        yOver += overtime;

        if (day.type === "dopust") vac++;
        if (day.type === "bolniska") sick++;

        if (m === month) {
          mWork += work;
          mHoliday += holidayHours;
          mOver += overtime;
          if (day.type === "dopust") mVac++;
          if (day.type === "bolniska") mSick++;
        }
      }
    }

    return {
      yWork, yHoliday, yOver, vac, sick,
      mWork, mHoliday, mOver, mVac, mSick,
      vacationLeft: vacationStart - vac
    };
  }, [data, month]);

  function goToday() {
    const now = new Date();
    if (now.getFullYear() !== YEAR) {
      setMonth(currentMonth);
      return;
    }

    setMonth(now.getMonth());
    setTimeout(() => {
      document.getElementById("day-" + makeKey(now.getMonth(), now.getDate()))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }

  function copyYesterday() {
    const now = new Date();

    if (now.getFullYear() !== YEAR) {
      alert("Funkcija je vezana na leto 2026.");
      return;
    }

    const y = new Date(now);
    y.setDate(now.getDate() - 1);

    if (y.getFullYear() !== YEAR) {
      alert("Včerajšnji dan ni v letu 2026.");
      return;
    }

    const yk = makeKey(y.getMonth(), y.getDate());
    const tk = makeKey(now.getMonth(), now.getDate());
    const source = getDay(yk);

    setMonth(now.getMonth());
    setData(prev => ({
      ...prev,
      days: {
        ...(prev.days || {}),
        [tk]: {
          work: source.work || "",
          overtime: source.overtime || "",
          type: source.type || "delo",
          note: ""
        }
      }
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "moje-ure-2026-podatki.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData() {
    const txt = prompt("Prilepi vsebino izvožene JSON datoteke:");
    if (!txt) return;

    try {
      setData(JSON.parse(txt));
      alert("Podatki so uvoženi.");
    } catch {
      alert("Uvoz ni uspel.");
    }
  }

  function resetAll() {
    if (confirm("Res želiš izbrisati vse vnose?")) {
      setData(emptyData());
    }
  }

  const settings = data.settings || emptyData().settings;

  return (
    <>
      <header>
        <h1>Moje ure 2026</h1>
        <p>Opravljene ure, nadure, prazniki, dopust in bolniška</p>
        <span className="sync">{sync}</span>
      </header>

      <main>
        <div className="card auth">
          {!session ? (
            <>
              <div className="authrow">
                <div>
                  <label>E-pošta</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="tvoj@email.si" />
                </div>
                <div>
                  <label>Geslo</label>
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="geslo" />
                </div>
                <div>
                  <label>&nbsp;</label>
                  <button className="good fullButton" type="button" onClick={signIn}>Prijava</button>
                </div>
              </div>

              <div className="buttons">
                <button className="secondary" type="button" onClick={signUp}>Ustvari račun</button>
              </div>

              <div className="status">{authMsg}</div>
            </>
          ) : (
            <>
              <strong>Prijavljen: {session.user.email}</strong>
              <div className="status">{sync}</div>
              <div className="buttons">
                <button type="button" onClick={loadCloud}>Osveži iz oblaka</button>
                <button className="secondary" type="button" onClick={signOut}>Odjava</button>
              </div>
            </>
          )}
        </div>

        {session && (
          <>
            <div className="topgrid">
              <Stat title="Letno opravljene ure" value={fmtHours(totals.yWork)} />
              <Stat title="Letne praznične ure" value={fmtHours(totals.yHoliday)} />
              <Stat title="Letne nadure" value={fmtHours(totals.yOver)} />
              <Stat title="Preostali dopust" value={`${totals.vacationLeft} dni`} />
              <Stat title="Bolniška skupaj" value={`${totals.sick} dni`} />
            </div>

            <div className="card settings">
              <div>
                <label>Dnevna norma ur</label>
                <input value={settings.normHours} onChange={e => updateSetting("normHours", e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <label>Začetni dopust / dni</label>
                <input value={settings.vacationStart} onChange={e => updateSetting("vacationStart", e.target.value)} type="number" step="0.5" />
              </div>
              <div>
                <label>Začetni saldo ur</label>
                <input value={settings.startBalance} onChange={e => updateSetting("startBalance", e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <div className="tabs">
              {months.map((name, i) => (
                <button key={name} className={i === month ? "active" : ""} type="button" onClick={() => setMonth(i)}>{name}</button>
              ))}
            </div>

            <div className="quickbar">
              <button type="button" onClick={goToday}>Danes</button>
              <button className="secondary" type="button" onClick={copyYesterday}>Kopiraj včeraj na danes</button>
            </div>

            <div className="monthTitle">
              <h2>{months[month]}</h2>
              <span className="badge">2026</span>
            </div>

            <div className="summary">
              <Stat title="Mesec: opravljene ure" value={fmtHours(totals.mWork)} />
              <Stat title="Mesec: praznične ure" value={fmtHours(totals.mHoliday)} />
              <Stat title="Mesec: nadure" value={fmtHours(totals.mOver)} />
              <Stat title="Mesec: dopust" value={`${totals.mVac} dni`} />
              <Stat title="Mesec: bolniška" value={`${totals.mSick} dni`} />
            </div>

            <div className="days">
              {Array.from({ length: daysInMonth(month) }, (_, idx) => idx + 1).map(d => {
                const k = makeKey(month, d);
                const day = getDay(k);
                const date = new Date(YEAR, month, d);
                const classes = ["daycard"];

                if (date.getDay() === 0 || date.getDay() === 6) classes.push("weekend");
                if (day.type === "praznik") classes.push("holiday");
                else if (day.type === "dopust") classes.push("vacation");
                else if (day.type === "bolniska") classes.push("sick");
                else if (touched(day, k)) classes.push("filled");

                return (
                  <div className={classes.join(" ")} key={k} id={"day-" + k}>
                    <div className="dayhead">
                      <div>
                        <div className="date">{d}. {month + 1}. 2026</div>
                        <div className="sub">{dayNames[date.getDay()]}{holidays[k] ? " · " + holidays[k] : ""}</div>
                      </div>
                      <span className="badge">{day.type === "praznik" ? "praznik" : fmtHours(parseHours(day.work))}</span>
                    </div>

                    <div className="fields">
                      <div>
                        <label>Opravljene ure</label>
                        <input value={day.work} onChange={e => updateDay(k, "work", e.target.value)} inputMode="numeric" placeholder="8:00" />
                      </div>

                      <div>
                        <label>Nadure</label>
                        <input value={day.overtime} onChange={e => updateDay(k, "overtime", e.target.value)} inputMode="numeric" placeholder="0:30" />
                      </div>

                      <div>
                        <label>Vrsta dneva</label>
                        <select value={day.type} onChange={e => updateDay(k, "type", e.target.value)}>
                          <option value="delo">Delo</option>
                          <option value="dopust">Dopust</option>
                          <option value="bolniska">Bolniška</option>
                          <option value="praznik">Praznik</option>
                          <option value="prosto">Prosto</option>
                        </select>
                      </div>

                      <div className="wide">
                        <label>Opomba</label>
                        <input value={day.note} onChange={e => updateDay(k, "note", e.target.value)} placeholder="opomba" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="buttons">
              <button type="button" onClick={exportData}>Izvozi kopijo</button>
              <button className="secondary" type="button" onClick={importData}>Uvozi podatke</button>
              <button className="secondary" type="button" onClick={resetAll}>Ponastavi</button>
            </div>

            <p className="note">
              Ure lahko vpisuješ kot 8:00, 7:30, 1:15 ali tudi kot 8 / 7.5.
              Prazniki so rdeči, dopust moder, bolniška oranžna, vpisani delovni dnevi zeleni.
            </p>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ title, value }) {
  return (
    <div className="card stat">
      <small>{title}</small>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
