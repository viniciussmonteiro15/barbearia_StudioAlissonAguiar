require("dotenv").config();
process.env.TZ = process.env.TZ || "America/Sao_Paulo";
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
 
const app = express();
const PORT = Number(process.env.PORT || 3000);
 
// ---------- Banco (MySQL) ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "studio_alison_aguiar",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  dateStrings: true // DATE/TIME/TIMESTAMP chegam como texto ("2026-11-30"), sem conversão de fuso
});
 
// ---------- Utilidades ----------
const cents = c => Number((c / 100).toFixed(2));
const pad = n => String(n).padStart(2, "0");
const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = t => {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(t || "")) return -1;
  const [h, m] = t.split(":").map(Number);
  return h > 23 || m > 59 ? -1 : h * 60 + m;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const validDate = s =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(Date.parse(s + "T12:00:00")) &&
  new Date(s + "T12:00:00").toISOString().slice(0, 10) === s;
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
 
async function getSettings(conn = pool) {
  const s = {};
  const [rows] = await conn.query("SELECT `key`, `value` FROM settings");
  for (const r of rows) {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  }
  const [closed] = await conn.query("SELECT `date` FROM closed_dates ORDER BY `date`");
  s.closedDates = closed.map(r => r.date);
  s.openDays = Array.isArray(s.openDays) ? s.openDays : [1, 2, 3, 4, 5, 6];
  s.openTime = s.openTime || "09:00";
  s.closeTime = s.closeTime || "18:00";
  return s;
}
 
function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
 
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const rec = (hits.get(req.ip) || []).filter(t => now - t < windowMs);
    if (rec.length >= max) return res.status(429).json({ error: "Muitas tentativas. Aguarde um pouco e tente novamente." });
    rec.push(now); hits.set(req.ip, rec); next();
  };
}
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const bookLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
const failLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
 
function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === "troque-esta-senha") {
    return res.status(503).json({ error: "Configure ADMIN_PASSWORD no arquivo .env antes de usar o painel administrativo." });
  }
  const provided = req.get("x-admin-password");
  if (!provided || !safeEqual(provided, expected)) {
    return failLimiter(req, res, () => res.status(401).json({ error: "Senha administrativa incorreta." }));
  }
  next();
}
 
// ---------- Regras de agenda ----------
async function activeServices(conn = pool) {
  const [rows] = await conn.query("SELECT * FROM services WHERE active = 1 ORDER BY sort_order, name");
  return rows;
}
 
// Horários livres considerando a duração total (bloqueia intervalos sobrepostos)
async function availableSlots(date, durationMin = 30, conn = pool) {
  const s = await getSettings(conn);
  if (!validDate(date) || date < today()) return [];
  const dow = new Date(date + "T12:00:00").getDay();
  if (!s.openDays.includes(dow) || s.closedDates.includes(date)) return [];
  const start = toMin(s.openTime), end = toMin(s.closeTime), step = Number(s.slotMinutes) || 30;
  if (start < 0 || end <= start || step < 15 || step > 120) return [];
 
  const [rows] = await conn.query(
    "SELECT TIME_FORMAT(`time`, '%H:%i') AS t, duration_min FROM appointments WHERE `date` = ? AND status <> 'cancelled'",
    [date]
  );
  const busy = rows.map(r => ({ a: toMin(r.t), b: toMin(r.t) + r.duration_min }));
 
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];
  for (let m = start; m + durationMin <= end; m += step) {
    if (date === today() && m <= nowMin) continue;
    if (busy.some(x => m < x.b && m + durationMin > x.a)) continue;
    out.push(toTime(m));
  }
  return out;
}
 
async function loadAppointments(rows, conn = pool) {
  if (!rows.length) return [];
  const [items] = await conn.query(
    "SELECT * FROM appointment_services WHERE appointment_id IN (?)",
    [rows.map(r => r.id)]
  );
  return rows.map(r => ({
    id: r.id, name: r.name, phone: r.phone, date: r.date, time: String(r.time).slice(0, 5),
    services: items.filter(i => i.appointment_id === r.id)
      .map(i => ({ id: i.service_id, name: i.name, price: cents(i.price_cents) })),
    total: cents(r.total_cents),
    paymentMethod: r.payment_method, paymentStatus: r.payment_status,
    status: r.status, createdAt: r.created_at
  }));
}
 
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));
 
// ---------- API pública ----------
app.get("/api/services", wrap(async (req, res) => {
  const list = await activeServices();
  res.json(list.map(s => ({ id: s.id, name: s.name, price: cents(s.price_cents), duration: s.duration_min })));
}));
 
app.get("/api/settings/public", wrap(async (req, res) => {
  const s = await getSettings();
  res.json({
    openDays: s.openDays, openTime: s.openTime, closeTime: s.closeTime,
    slotMinutes: Number(s.slotMinutes) || 30,
    name: process.env.BARBERSHOP_NAME || "Studio Alison Aguiar",
    phone: String(process.env.BARBERSHOP_PHONE || "").replace(/\D/g, "")
  });
}));
 
app.get("/api/slots", wrap(async (req, res) => {
  const date = String(req.query.date || "");
  let duration = 30;
  if (req.query.serviceIds) {
    const ids = String(req.query.serviceIds).split(",");
    const map = new Map((await activeServices()).map(s => [s.id, s]));
    if (ids.every(i => map.has(i))) duration = ids.reduce((t, i) => t + map.get(i).duration_min, 0);
  }
  res.json({ date, slots: await availableSlots(date, duration) });
}));
 
app.post("/api/appointments", bookLimiter, wrap(async (req, res) => {
  const { name, phone, date, time, serviceIds, paymentMethod } = req.body || {};
 
  if (typeof name !== "string" || name.trim().split(/\s+/).length < 2 || name.trim().length > 100)
    return res.status(400).json({ error: "Informe seu nome completo." });
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13)
    return res.status(400).json({ error: "Informe um celular válido com DDD." });
  if (!validDate(date) || date < today())
    return res.status(400).json({ error: "Escolha uma data válida, hoje ou no futuro." });
  if (toMin(time) < 0) return res.status(400).json({ error: "Escolha um horário válido." });
  if (!["pix", "later"].includes(paymentMethod))
    return res.status(400).json({ error: "Escolha uma forma de pagamento." });
 
  const map = new Map((await activeServices()).map(s => [s.id, s]));
  const ids = Array.isArray(serviceIds) ? [...new Set(serviceIds)] : [];
  if (ids.length < 1 || ids.length > 10 || ids.some(i => !map.has(i)))
    return res.status(400).json({ error: "Escolha pelo menos um serviço válido." });
  const chosen = ids.map(i => map.get(i));
  const total = chosen.reduce((t, s) => t + s.price_cents, 0);
  const duration = chosen.reduce((t, s) => t + s.duration_min, 0);
  const hhmm = time.slice(0, 5);
 
  const conn = await pool.getConnection();
  const lockName = `booking:${date}`;
  let locked = false;
  try {
    // Trava por data: dois clientes não reservam ao mesmo tempo o mesmo dia
    const [[lk]] = await conn.query("SELECT GET_LOCK(?, 5) AS ok", [lockName]);
    locked = lk.ok === 1;
    if (!locked) return res.status(503).json({ error: "Sistema ocupado. Tente novamente em instantes." });
 
    await conn.beginTransaction();
    if (!(await availableSlots(date, duration, conn)).includes(hhmm)) {
      await conn.rollback();
      return res.status(409).json({ error: "Esse horário não está mais disponível. Escolha outro horário." });
    }
    const [ins] = await conn.query(
      `INSERT INTO appointments (name, phone, \`date\`, \`time\`, duration_min, total_cents, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), digits, date, hhmm, duration, total, paymentMethod]
    );
    await conn.query(
      "INSERT INTO appointment_services (appointment_id, service_id, name, price_cents) VALUES ?",
      [chosen.map(s => [ins.insertId, s.id, s.name, s.price_cents])]
    );
    await conn.commit();
 
    const [rows] = await conn.query("SELECT * FROM appointments WHERE id = ?", [ins.insertId]);
    res.status(201).json({
      appointment: (await loadAppointments(rows, conn))[0],
      pix: {
        mode: process.env.PIX_MODE || "demo",
        message: paymentMethod === "pix"
          ? "Pix ainda está em modo de demonstração. Nenhum pagamento foi cobrado."
          : "O pagamento será feito presencialmente na barbearia."
      }
    });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Alguém acabou de reservar esse horário. Escolha outro." });
    console.error(e);
    res.status(500).json({ error: "Não foi possível registrar o agendamento." });
  } finally {
    if (locked) { try { await conn.query("SELECT RELEASE_LOCK(?)", [lockName]); } catch {} }
    conn.release();
  }
}));
 
// ---------- API administrativa ----------
app.get("/api/admin/appointments", adminLimiter, adminAuth, wrap(async (req, res) => {
  const date = String(req.query.date || "");
  const [rows] = date && validDate(date)
    ? await pool.query("SELECT * FROM appointments WHERE `date` = ? ORDER BY `time`", [date])
    : await pool.query("SELECT * FROM appointments ORDER BY `date` DESC, `time` DESC LIMIT 300");
  res.json({ appointments: await loadAppointments(rows) });
}));
 
app.patch("/api/admin/appointments/:id", adminLimiter, adminAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { status, paymentStatus } = req.body || {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Agendamento inválido." });
  if (status !== undefined && !["booked", "cancelled", "completed"].includes(status))
    return res.status(400).json({ error: "Status inválido." });
  if (paymentStatus !== undefined && !["pending", "paid"].includes(paymentStatus))
    return res.status(400).json({ error: "Status de pagamento inválido." });
  const [found] = await pool.query("SELECT id FROM appointments WHERE id = ?", [id]);
  if (!found.length) return res.status(404).json({ error: "Agendamento não encontrado." });
  try {
    if (status !== undefined) await pool.query("UPDATE appointments SET status = ? WHERE id = ?", [status, id]);
    if (paymentStatus !== undefined) await pool.query("UPDATE appointments SET payment_status = ? WHERE id = ?", [paymentStatus, id]);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Já existe outro agendamento ativo nesse horário." });
    throw e;
  }
  const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [id]);
  res.json({ appointment: (await loadAppointments(rows))[0] });
}));
 
app.get("/api/admin/settings", adminLimiter, adminAuth, wrap(async (req, res) => res.json(await getSettings())));
 
app.put("/api/admin/settings", adminLimiter, adminAuth, wrap(async (req, res) => {
  const { openDays, openTime, closeTime, slotMinutes, closedDates } = req.body || {};
  const start = toMin(openTime), end = toMin(closeTime), slot = Number(slotMinutes);
  if (!Array.isArray(openDays) || openDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
      start < 0 || end <= start || !Number.isInteger(slot) || slot < 15 || slot > 120 ||
      !Array.isArray(closedDates) || closedDates.some(d => !validDate(d))) {
    return res.status(400).json({ error: "Confira os dias, horários, duração dos intervalos e datas fechadas." });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const up = "INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)";
    await conn.query(up, ["openDays", JSON.stringify([...new Set(openDays)])]);
    await conn.query(up, ["openTime", openTime.slice(0, 5)]);
    await conn.query(up, ["closeTime", closeTime.slice(0, 5)]);
    await conn.query(up, ["slotMinutes", String(slot)]);
    await conn.query("DELETE FROM closed_dates");
    const uniq = [...new Set(closedDates)];
    if (uniq.length) await conn.query("INSERT INTO closed_dates (`date`) VALUES ?", [uniq.map(d => [d])]);
    await conn.commit();
    res.json({ ok: true, settings: await getSettings(conn) });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}));
 
app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada." }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status === 400 ? 400 : 500).json({ error: "Erro interno ou requisição inválida." });
});
 
// ---------- Início ----------
(async () => {
  try {
    await pool.query("SELECT 1 FROM services LIMIT 1");
  } catch (e) {
    console.error("\nNão foi possível usar o banco MySQL:", e.code || e.message);
    console.error("Verifique: 1) MySQL ligado  2) DB_USER/DB_PASSWORD/DB_NAME no .env  3) o schema.sql foi executado no Workbench.\n");
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Studio Alison Aguiar rodando em http://localhost:${PORT}`));
})();
 
