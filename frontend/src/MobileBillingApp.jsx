import React, { useEffect, useMemo, useState } from "react";
import {
  Home,
  Receipt,
  Users,
  Menu,
  Search,
  RefreshCw,
  LogOut,
  UserCircle,
  ChevronRight,
  X,
  CreditCard,
  CheckCircle2,
  Clock3,
  Wifi,
  Moon,
  Sun,
} from "lucide-react";
import { api } from "./lib/api.js";
import { money } from "./utils/format.js";
import {
  listThermalPrinters,
  connectThermalPrinter,
  disconnectThermalPrinter,
  printThermalText,
  getSavedThermalPrinter,
} from "./lib/thermal-printer.js";
import "./mobile.css";

const moneyDue = (i) =>
  Math.max(0, Number(i.amount || 0) - Number(i.paid_amount || 0));
const fmtDate = (d) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(
        "id-ID",
        { day: "2-digit", month: "short", year: "numeric" },
      )
    : "-";
const fmtDateTime = (d) => {
  if (!d || d === "-") return "-";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return String(d);
  return parsed.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const FALLBACK_MM58_HTML = `<header class="head"><h1>{{brand_name}}</h1><h2>TAGIHAN / BUKTI BAYAR</h2><p>{{invoice_number}}</p></header><section class="section"><div class="item"><span>Tanggal</span><b>{{issue_date}}</b></div><div class="item"><span>Jatuh tempo</span><b>{{due_date}}</b></div><div class="item"><span>Pelanggan</span><b>{{customer_name}}</b></div><div class="item"><span>Kode</span><b>{{customer_code}}</b></div><div class="item"><span>HP</span><b>{{customer_phone}}</b></div><div class="item"><span>Alamat</span><b>{{customer_address}}</b></div><div class="item"><span>Layanan</span><b>{{service_type}}</b></div><div class="item"><span>Paket</span><b>{{package_name}}</b></div><div class="item"><span>Periode</span><b>{{period_start}} - {{period_end}}</b></div></section><section class="section"><div class="item"><span>Total</span><b>{{invoice_amount}}</b></div><div class="item"><span>Dibayar</span><b>{{paid_amount}}</b></div><div class="total"><span>SISA</span><span>{{remaining_amount}}</span></div><div class="item"><span>Metode</span><b>{{payment_method}}</b></div><div class="item"><span>Status</span><b>{{payment_reference}}</b></div></section><section class="section"><div class="item"><span>Rekening</span><b>{{bank_name}}</b></div><div class="item"><span>No. Rek</span><b>{{account_number}}</b></div></section><div class="sign">Terima kasih<br>{{payment_date}}<br>Petugas: {{created_by}}</div>`;

export default function MobileBillingApp({
  auth,
  onLogout,
  liveMikrotik = {},
}) {
  const [printer, setPrinter] = useState(getSavedThermalPrinter()),
    [printerDevices, setPrinterDevices] = useState([]),
    [printerBusy, setPrinterBusy] = useState(false),
    [printPreview, setPrintPreview] = useState(null);
  const [tab, setTab] = useState("home"),
    [customers, setCustomers] = useState([]),
    [customerStatuses, setCustomerStatuses] = useState({}),
    [invoices, setInvoices] = useState([]),
    [payments, setPayments] = useState([]),
    [accounts, setAccounts] = useState([]),
    [brand, setBrand] = useState("Noble Media"),
    [brandLogo, setBrandLogo] = useState(""),
    [invoiceFilter, setInvoiceFilter] = useState("unpaid"),
    [brandForm, setBrandForm] = useState({ name: "Noble Media", logo: "" }),
    [profile, setProfile] = useState(auth.user),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [payment, setPayment] = useState(null),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [dark, setDark] = useState(false),
    [editProfile, setEditProfile] = useState(false),
    [profileForm, setProfileForm] = useState({
      name: auth.user.name,
      password: "",
      confirm: "",
    });
  const isCollector = auth.user.role === "kolektor";
  const monthNow = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" })
    .slice(0, 7);

  const getLiveForCustomer = (c, statusMap = customerStatuses) => {
    if (!c) return null;
    if (statusMap && typeof statusMap === "object") {
      if (statusMap[c.id]) return statusMap[c.id];
      if (statusMap[String(c.id)]) return statusMap[String(c.id)];
    }
    if (!liveMikrotik) return null;
    if (Array.isArray(liveMikrotik)) {
      return (
        liveMikrotik.find(
          (item) =>
            Number(item.customer_id) === Number(c.id) ||
            Number(item.id) === Number(c.id) ||
            (c.pppoe_username &&
              String(
                item.pppoe_username || item.username || item.name || "",
              ).toLowerCase() === String(c.pppoe_username).toLowerCase()),
        ) || null
      );
    }
    if (typeof liveMikrotik === "object") {
      if (liveMikrotik[c.id]) return liveMikrotik[c.id];
      if (liveMikrotik[String(c.id)]) return liveMikrotik[String(c.id)];
      if (c.pppoe_username && liveMikrotik[c.pppoe_username]) {
        return liveMikrotik[c.pppoe_username];
      }
    }
    return null;
  };

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [c, i, a, b, p, payRes, statusRes] = await Promise.all([
        api("/customers"),
        api("/invoices"),
        api("/bank-accounts"),
        api("/brand"),
        api("/profile"),
        api(`/payments?month=${encodeURIComponent(monthNow)}`).catch(() => ({
          rows: [],
        })),
        api("/customers/status").catch(() => ({ statuses: {} })),
      ]);
      setCustomers(c);
      setInvoices(i);
      setAccounts(a);
      setPayments(Array.isArray(payRes?.rows) ? payRes.rows : []);
      setCustomerStatuses(
        statusRes?.statuses && typeof statusRes.statuses === "object"
          ? statusRes.statuses
          : {},
      );
      setBrand(b.brand_name || "Noble Media");
      setBrandLogo(b.logo_data_url || "/noble-media-logo.svg");
      setBrandForm({
        name: b.brand_name || "Noble Media",
        logo: b.logo_data_url || "",
      });
      setProfile(p);
      setProfileForm((f) => ({ ...f, name: p.name }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const unpaid = invoices.filter((i) =>
    ["unpaid", "partial"].includes(i.status),
  );
  const paid = invoices.filter(
    (i) => i.status === "paid" && String(i.period_month || "") === monthNow,
  );
  const activeCustomers = customers.filter(
    (c) =>
      Boolean(c.active) &&
      c.customer_status === "active" &&
      c.isolation_status !== "isolated",
  );
  const inactiveCustomers = customers.filter(
    (c) => !Boolean(c.active) || c.customer_status !== "active",
  );
  const shownCustomers = useMemo(
    () =>
      customers.filter((c) =>
        `${c.name} ${c.customer_code} ${c.phone || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [customers, search],
  );
  const filteredInvoices =
    invoiceFilter === "paid"
      ? paid
      : invoiceFilter === "all"
        ? invoices.filter((i) =>
            ["unpaid", "partial", "paid"].includes(i.status),
          )
        : unpaid;
  const shownInvoices = useMemo(
    () =>
      filteredInvoices.filter((i) =>
        `${i.customer_name} ${i.customer_code} ${i.invoice_number}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [filteredInvoices, search],
  );

  async function refreshPrinters() {
    setPrinterBusy(true);
    try {
      const devices = await listThermalPrinters();
      setPrinterDevices(devices);
      if (
        printer?.address &&
        !devices.some((d) => d.address === printer.address)
      )
        setPrinter((v) => ({ ...v, connected: false }));
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinterBusy(false);
    }
  }
  async function choosePrinter(address) {
    const device = printerDevices.find((d) => d.address === address);
    if (!device) return;
    setPrinterBusy(true);
    try {
      const value = await connectThermalPrinter(device);
      setPrinter(value);
      setNotice(`Printer ${device.name} berhasil tersambung.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinterBusy(false);
    }
  }
  async function disconnectPrinterNow() {
    setPrinterBusy(true);
    try {
      await disconnectThermalPrinter();
      setPrinter(null);
      setNotice("Printer diputus.");
    } catch (e) {
      setError(e.message);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function printInvoice58(invoice) {
    if (!printer?.address) {
      if(!printer?.address){setError('Pilih dan sambungkan printer Bluetooth terlebih dahulu.');
        setTab('home');
        return;
        }
    }
    setPrinterBusy(true);
    try {
      const [v, stored] = await Promise.all([
        api("/invoices/" + invoice.id + "/print"),
        api("/receipt-template").catch(() => null),
      ]);

      const invoicePeriodMonth = String(
        invoice.period_month || v.period_start || "",
      ).slice(0, 7);
      let paymentRows = payments;
      if (invoicePeriodMonth && invoicePeriodMonth !== monthNow) {
        const monthPayments = await api(
          `/payments?month=${encodeURIComponent(invoicePeriodMonth)}`,
        ).catch(() => null);
        if (Array.isArray(monthPayments?.rows) && monthPayments.rows.length) {
          paymentRows = monthPayments.rows;
        }
      }

      let matchedPayment =
        Array.isArray(v.payments) && v.payments.length > 0
          ? v.payments[0]
          : (paymentRows || []).find(
              (row) =>
                Number(row.invoice_id) === Number(invoice.id) ||
                String(row.invoice_number || "") ===
                  String(v.invoice_number || invoice.invoice_number || ""),
            ) || null;

      let receiptData = null;
      if (
        !matchedPayment &&
        !v.payment_date &&
        !v.payment_method &&
        !v.payment_reference &&
        (Number(v.paid_amount || 0) > 0 || invoice.status === "paid")
      ) {
        receiptData = await api(`/invoices/${invoice.id}/receipt`).catch(
          () => null,
        );
        if (
          Array.isArray(receiptData?.payments) &&
          receiptData.payments.length > 0
        ) {
          matchedPayment = receiptData.payments[0];
        }
      }

      const rawDate =
        v.payment_date ||
        v.latest_paid_at ||
        receiptData?.latest_paid_at ||
        matchedPayment?.paid_at ||
        "";
      const rawMethod =
        v.payment_method ||
        v.latest_method ||
        receiptData?.latest_method ||
        matchedPayment?.method ||
        "";
      const rawRef =
        v.payment_reference ||
        v.latest_reference ||
        receiptData?.latest_reference ||
        matchedPayment?.reference_number ||
        matchedPayment?.receipt_number ||
        "";

      const hasPayRef =
        Boolean(String(rawRef || "").trim()) && String(rawRef).trim() !== "-";
      const paymentStatusText = hasPayRef ? "Lunas" : "Belum lunas";

      const fmtPaymentDate = (x) =>
        x
          ? new Date(x).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "-";

      const width = 28;
      const center = (value) => {
        const t = String(value || "").trim();
        return t.length >= width
          ? t
          : t.padStart(Math.floor((width + t.length) / 2)).padEnd(width);
      };
      const wrap = (value) => {
        const words = String(value ?? "-")
          .trim()
          .split(/\s+/);
        const out = [];
        let line = "";
        for (const word of words) {
          if (!line) {
            line = word;
            continue;
          }
          if ((line + " " + word).length <= width) line += " " + word;
          else {
            out.push(line);
            line = word;
          }
        }
        if (line) out.push(line);
        return out.length ? out : ["-"];
      };
      const lr = (left, right) => {
        const l = String(left ?? "").trim();
        const r = String(right ?? "-").trim() || "-";
        if (!l) return wrap(r);
        if (l.length + r.length + 1 <= width) {
          return [l + " ".repeat(width - l.length - r.length) + r];
        }
        const wrappedRight = wrap(r);
        return [l, ...wrappedRight.map((part) => part.padStart(width))];
      };
      const separator = "-".repeat(width);

      const values = {
        brand_name: v.brand_name || brand,
        invoice_number: v.invoice_number,
        receipt_number: v.receipt_number || matchedPayment?.receipt_number || "-",
        customer_name: v.customer_name,
        customer_code: v.customer_code,
        customer_phone: v.phone || "-",
        customer_address: v.address || "-",
        package_name: v.package_name || "-",
        service_type:
          { internet: "Internet", tv_cable: "TV Kabel", bundle: "Bundle" }[
            v.service_type
          ] ||
          v.service_type ||
          "-",
        period_start: String(v.period_start || "").slice(0, 10),
        period_end: String(v.period_end || "").slice(0, 10),
        issue_date: String(v.issue_date || "").slice(0, 10),
        due_date: String(v.due_date || "").slice(0, 10),
        invoice_amount: money(v.amount),
        paid_amount: money(v.paid_amount),
        remaining_amount: money(
          Math.max(0, Number(v.amount || 0) - Number(v.paid_amount || 0)),
        ),
        payment_date: fmtPaymentDate(rawDate),
        payment_method:
          rawMethod === "transfer"
            ? "Transfer"
            : rawMethod === "cash"
              ? "Cash"
              : rawMethod || "-",
        payment_reference: paymentStatusText,
        bank_name: v.bank_name || matchedPayment?.bank_name || "-",
        account_name: v.account_name || matchedPayment?.account_name || "-",
        account_number: v.account_number || matchedPayment?.account_number || "-",
        payment_count: String(
          v.payment_count ?? (matchedPayment ? 1 : 0),
        ),
        created_by:
          v.created_by ||
          matchedPayment?.created_by ||
          profile?.name ||
          auth.user?.name ||
          "-",
        payment_rows: v.payment_rows || "",
      };

      const templateSource =
        stored?.templates?.mm58 || v.print_template || FALLBACK_MM58_HTML;
      const interpolated = String(templateSource).replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (_, key) =>
          values[key] !== undefined &&
          values[key] !== null &&
          String(values[key]).trim() !== ""
            ? String(values[key])
            : "-",
      );

      const parser = new DOMParser();
      const doc = parser.parseFromString(interpolated, "text/html");
      doc.querySelectorAll("style, script").forEach((el) => el.remove());

      const lines = [];
      const pushSectionDividerIfNeeded = (nextLines) => {
        if (!nextLines.length) return;
        const prev = lines[lines.length - 1];
        if (lines.length > 0 && prev !== separator && prev !== "") {
          lines.push(separator);
        }
        lines.push(...nextLines);
      };

      const splitHtmlBreaksToCenteredLines = (htmlFragment, centered) => {
        const result = [];
        const chunks = String(htmlFragment || "").split(/<br\s*\/?>/i);
        for (const chunk of chunks) {
          const tmp = parser.parseFromString(chunk, "text/html");
          const text = (tmp.body.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          if (!text) continue;
          const wrapped = wrap(text);
          result.push(...(centered ? wrapped.map(center) : wrapped));
        }
        return result;
      };

      const parseContainer = (containerEl, centered = false) => {
        const result = [];
        const hasElementChildren = containerEl.children.length > 0;
        if (!hasElementChildren) {
          return splitHtmlBreaksToCenteredLines(
            containerEl.innerHTML,
            centered,
          );
        }

        Array.from(containerEl.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.replace(/\s+/g, " ").trim();
            if (text) {
              const wrapped = wrap(text);
              result.push(...(centered ? wrapped.map(center) : wrapped));
            }
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const child = node;
          const tag = child.tagName.toUpperCase();
          if (
            child.classList.contains("item") ||
            child.classList.contains("total")
          ) {
            const pair = Array.from(child.children);
            const leftText = (pair[0]?.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
            const rightText = (pair[1]?.textContent || "")
              .replace(/\s+/g, " ")
              .trim();
            if (leftText || rightText) {
              result.push(...lr(leftText, rightText || "-"));
            }
          } else if (tag === "HR") {
            result.push(separator);
          } else if (tag === "BR") {
            // diabaikan
          } else {
            result.push(
              ...splitHtmlBreaksToCenteredLines(child.innerHTML, centered),
            );
          }
        });
        return result;
      };

      Array.from(doc.body.children).forEach((el) => {
        const tag = el.tagName.toUpperCase();
        if (tag === "MAIN") {
          Array.from(el.children).forEach((sub) => {
            const subTag = sub.tagName.toUpperCase();
            if (subTag === "HEADER" || sub.classList.contains("sign")) {
              pushSectionDividerIfNeeded(parseContainer(sub, true));
            } else {
              pushSectionDividerIfNeeded(parseContainer(sub, false));
            }
          });
        } else if (tag === "HEADER" || el.classList.contains("sign")) {
          pushSectionDividerIfNeeded(parseContainer(el, true));
        } else {
          pushSectionDividerIfNeeded(parseContainer(el, false));
        }
      });

      const ensureLine = (labelText, fallbackVal) => {
        const found = lines.some((l) => l.trim().startsWith(labelText));
        if (!found) {
          lines.push(...lr(labelText, fallbackVal || "-"));
        }
      };

      ensureLine("Metode", values.payment_method);
      ensureLine("Status", values.payment_reference);
      if (!lines.some((line) => line.includes("Petugas:"))) {
        lines.push(center(`Petugas: ${values.created_by}`));
      }

      lines.push("");
      setPrintPreview({ invoice, lines, raw: lines.join("\n") + "\n\n" });
    } catch (e) {
      setError("Gagal menyiapkan pratinjau: " + e.message);
    } finally {
      setPrinterBusy(false);
    }
  }

  async function confirmPrintInvoice() {
    if (!printPreview) return;
    if (
      !window.confirm(
        `Cetak tagihan ${printPreview.invoice.invoice_number} ke printer ${printer?.name || "Bluetooth"}?`,
      )
    )
      return;
    setPrinterBusy(true);
    try {
      await printThermalText(printPreview.raw);
      setNotice("Struk berhasil dikirim ke printer.");
      setPrintPreview(null);
    } catch (e) {
      setError("Gagal mencetak: " + e.message);
    } finally {
      setPrinterBusy(false);
    }
  }
  async function savePayment(data) {
    setSaving(true);
    try {
      await api("/payments", { method: "POST", body: JSON.stringify(data) });
      setPayment(null);
      setNotice("Pembayaran berhasil dicatat.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function saveBrand(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const b = await api("/brand", {
        method: "PUT",
        body: JSON.stringify({
          brand_name: brandForm.name,
          logo_data_url: brandForm.logo,
        }),
      });
      setBrand(b.brand_name);
      setBrandLogo(b.logo_data_url || "");
      setNotice("Identitas aplikasi berhasil diperbarui.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function saveProfile(e) {
    e.preventDefault();
    if (profileForm.password && profileForm.password !== profileForm.confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setSaving(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profileForm.name,
          password: profileForm.password,
        }),
      });
      setEditProfile(false);
      setProfileForm((f) => ({ ...f, password: "", confirm: "" }));
      setNotice("Profil berhasil diperbarui.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const openDetail = async (c) => {
    const initialLive = getLiveForCustomer(c);
    setSelected({ customer: c, live: initialLive, loading: true });
    try {
      const [d, statusRes] = await Promise.all([
        api(`/customers/${c.id}/details`),
        api("/customers/status").catch(() => null),
      ]);
      const nextStatuses =
        statusRes?.statuses && typeof statusRes.statuses === "object"
          ? { ...customerStatuses, ...statusRes.statuses }
          : customerStatuses;
      if (statusRes?.statuses) {
        setCustomerStatuses(nextStatuses);
      }
      const mergedCustomer = d.customer || c;
      const liveFromApi = getLiveForCustomer(mergedCustomer, nextStatuses);
      const mergedLive = {
        ...(initialLive || {}),
        ...(d.live || d.mikrotik || {}),
        ...(liveFromApi || {}),
      };
      setSelected({
        ...d,
        customer: mergedCustomer,
        live: mergedLive,
        loading: false,
      });
    } catch (e) {
      setError(e.message);
      setSelected(null);
    }
  };
  return (
    <div className={`mobile-app ${dark ? "mobile-dark" : ""}`}>
      <header className="m-header">
        <div className="m-brand">
          <div className="m-brand-icon">
            {brandLogo ? (
              <img src={brandLogo} alt="Logo aplikasi" />
            ) : (
              <Wifi size={19} />
            )}
          </div>
          <div>
            <b>{brand}</b>
            <small>
              {tab === "home"
                ? "Ringkasan layanan"
                : tab === "invoices"
                  ? "Tagihan pelanggan"
                  : tab === "customers"
                    ? "Data pelanggan"
                    : "Akun & pengaturan"}
            </small>
          </div>
        </div>
        <button
          className="m-icon-btn"
          onClick={() => {
            load();
          }}
          aria-label="Refresh"
        >
          <RefreshCw size={19} />
        </button>
      </header>
      <main className="m-content">
        {error && (
          <div className="m-alert error">
            {error}
            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="m-alert success">
            {notice}
            <button onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {loading && <div className="m-loading">Memuat data…</div>}
        {!loading && tab === "home" && (
          <>
            <div className="m-greeting">
              <div>
                <span>Selamat datang,</span>
                <h1>{profile.name}</h1>
                <p>Berikut ringkasan billing hari ini.</p>
              </div>
              <div className="m-avatar">
                {profile.name?.slice(0, 1)?.toUpperCase()}
              </div>
            </div>
            <section className="m-section m-printer-panel">
              <div className="m-section-head">
                <div>
                  <h2>Printer thermal 58 mm</h2>
                  <p>
                    {printer?.connected
                      ? `Terhubung: ${printer.name}`
                      : "Belum ada printer terhubung"}
                  </p>
                </div>
                <span
                  className={`m-status ${printer?.connected ? "ok" : "due"}`}
                >
                  {printer?.connected ? "Terhubung" : "Terputus"}
                </span>
              </div>
              <div className="m-printer-actions">
                <button
                  className="m-secondary"
                  disabled={printerBusy}
                  onClick={refreshPrinters}
                >
                  <RefreshCw size={16} />
                  {printerBusy ? "Memproses…" : "Cari printer"}
                </button>
                {printer?.connected && (
                  <button
                    className="m-secondary"
                    disabled={printerBusy}
                    onClick={disconnectPrinterNow}
                  >
                    Putuskan
                  </button>
                )}
              </div>
              {printerDevices.length > 0 && (
                <div className="m-printer-list">
                  {printerDevices.map((d) => (
                    <button
                      key={d.address}
                      disabled={printerBusy}
                      onClick={() => choosePrinter(d.address)}
                    >
                      <span>
                        <b>{d.name || "Bluetooth Printer"}</b>
                        <small>{d.address}</small>
                      </span>
                      <span>
                        {printer?.address === d.address
                          ? "Terpilih"
                          : "Hubungkan"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <small className="m-printer-hint">
                Daftar perangkat menampilkan printer Bluetooth yang sudah
                dipasangkan di pengaturan Android.
              </small>
            </section>
            <div className="m-stat-grid">
              <button
                className="m-stat blue"
                onClick={() => {
                  setTab("customers");
                  setSearch("");
                }}
              >
                <span>Total pelanggan aktif</span>
                <strong>{activeCustomers.length}</strong>
                <small>
                  <CheckCircle2 size={14} /> Aktif
                </small>
              </button>
              <button
                className="m-stat orange"
                onClick={() => {
                  setTab("customers");
                  setSearch("");
                }}
              >
                <span>Pelanggan nonaktif</span>
                <strong>{inactiveCustomers.length}</strong>
                <small>
                  <Clock3 size={14} /> Nonaktif
                </small>
              </button>
              <button
                className="m-stat green"
                onClick={() => {
                  setTab("invoices");
                  setInvoiceFilter("paid");
                  setSearch("");
                }}
              >
                <span>Tagihan sudah bayar</span>
                <strong>{paid.length}</strong>
                <small>
                  <CheckCircle2 size={14} /> Lunas
                </small>
              </button>
              <button
                className="m-stat red"
                onClick={() => {
                  setTab("invoices");
                  setInvoiceFilter("unpaid");
                  setSearch("");
                }}
              >
                <span>Belum dibayar</span>
                <strong>{unpaid.length}</strong>
                <small>
                  <Clock3 size={14} /> Perlu ditindaklanjuti
                </small>
              </button>
            </div>
            <section className="m-section">
              <div className="m-section-head">
                <div>
                  <h2>Tagihan perlu ditindaklanjuti</h2>
                  <p>{unpaid.length} tagihan belum lunas</p>
                </div>
                <button
                  onClick={() => {
                    setTab("invoices");
                    setInvoiceFilter("unpaid");
                  }}
                >
                  Lihat semua
                </button>
              </div>
              {unpaid.slice(0, 4).map((i) => (
                <InvoiceCard
                  key={i.id}
                  invoice={i}
                  onPay={() => setPayment(i)}
                  onDetail={() => {
                    const c = customers.find((x) => x.id === i.customer_id);
                    if (c) openDetail(c);
                  }}
                />
              ))}
              {!unpaid.length && (
                <div className="m-empty">
                  Tidak ada tagihan yang belum dibayar.
                </div>
              )}
            </section>
          </>
        )}
        {!loading && tab === "invoices" && (
          <>
            <div className="m-page-title">
              <h1>Tagihan</h1>
              <p>Daftar pelanggan yang masih memiliki tagihan.</p>
            </div>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Cari nama, kode, atau nomor tagihan…"
            />
            <div className="m-filter-row">
              {[
                ["all", "Semua"],
                ["unpaid", "Belum lunas"],
                ["paid", "Lunas"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={invoiceFilter === v ? "active" : ""}
                  onClick={() => setInvoiceFilter(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="m-list-meta">
              {shownInvoices.length} tagihan · lunas hanya periode {monthNow}
            </div>
            {shownInvoices.map((i) => (
              <InvoiceCard
                key={i.id}
                invoice={i}
                onPay={() => setPayment(i)}
                onDetail={() => {
                  const c = customers.find((x) => x.id === i.customer_id);
                  if (c) openDetail(c);
                }}
                onPrint={() => printInvoice58(i)}
                onDelete={
                  auth.user.role !== "kolektor"
                    ? async () => {
                        if (
                          !window.confirm(
                            `Hapus tagihan ${i.invoice_number}? Pembayaran terkait juga akan dihapus dan tindakan tidak dapat dibatalkan.`,
                          )
                        )
                          return;
                        try {
                          await api(`/invoices/${i.id}`, { method: "DELETE" });
                          setNotice(`Tagihan ${i.invoice_number} dihapus.`);
                          await load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }
                    : null
                }
              />
            ))}
            {!shownInvoices.length && (
              <div className="m-empty">Tidak ada tagihan yang cocok.</div>
            )}
          </>
        )}
        {!loading && tab === "customers" && (
          <>
            <div className="m-page-title">
              <h1>Pelanggan</h1>
              <p>
                {isCollector
                  ? "Pelanggan yang ditugaskan kepada Anda."
                  : "Semua pelanggan terdaftar."}
              </p>
            </div>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Cari nama, kode, atau nomor HP…"
            />
            <div className="m-list-meta">{shownCustomers.length} pelanggan</div>
            {shownCustomers.map((c) => (
              <button
                className="m-customer-card"
                key={c.id}
                onClick={() => openDetail(c)}
              >
                <div className="m-customer-avatar">
                  {c.name?.slice(0, 1)?.toUpperCase()}
                </div>
                <div className="m-card-main">
                  <b>{c.name}</b>
                  <small>
                    {c.address}
                  </small>
                  <small>{c.phone || "Nomor HP belum diisi"} · {c.package_name || "Tanpa paket"}</small>
                </div>
                <span
                  className={`m-status ${c.active && c.customer_status === "active" ? "ok" : "off"}`}
                >
                  {c.active && c.customer_status === "active"
                    ? "Aktif"
                    : "Nonaktif"}
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {!shownCustomers.length && (
              <div className="m-empty">Pelanggan tidak ditemukan.</div>
            )}
          </>
        )}
        {!loading && tab === "more" && (
          <>
            <div className="m-page-title">
              <h1>Lainnya</h1>
              <p>Pengaturan akun dan aplikasi.</p>
            </div>
            <section className="m-profile-card">
              <div className="m-profile-avatar">
                <UserCircle size={30} />
              </div>
              <div>
                <b>{profile.name}</b>
                <small>
                  @{profile.username} · {profile.role}
                </small>
              </div>
            </section>
            <div className="m-menu-group">
              <button onClick={() => setEditProfile(true)}>
                <UserCircle size={19} /> Profil akun <ChevronRight size={18} />
              </button>
              <button onClick={() => setDark((v) => !v)}>
                {dark ? <Sun size={19} /> : <Moon size={19} />}{" "}
                {dark ? "Tema terang" : "Tema gelap"} <ChevronRight size={18} />
              </button>
              <button className="logout" onClick={onLogout}>
                <LogOut size={19} /> Keluar dari akun <ChevronRight size={18} />
              </button>
            </div>
            {auth.user.role === "superadmin" && (
              <section className="m-brand-settings">
                <h3>Identitas aplikasi</h3>
                <p>Ubah nama dan logo yang tampil di dalam aplikasi.</p>
                <form className="m-form" onSubmit={saveBrand}>
                  <label>
                    Nama aplikasi
                    <input
                      required
                      maxLength="120"
                      value={brandForm.name}
                      onChange={(e) =>
                        setBrandForm({ ...brandForm, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Logo aplikasi
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 500 * 1024) {
                          setError("Ukuran logo maksimal 500 KB.");
                          e.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () =>
                          setBrandForm((v) => ({
                            ...v,
                            logo: String(reader.result),
                          }));
                        reader.readAsDataURL(f);
                      }}
                    />
                  </label>
                  {brandForm.logo && (
                    <div className="m-logo-preview">
                      <img src={brandForm.logo} alt="Pratinjau logo" />
                      <button
                        type="button"
                        onClick={() =>
                          setBrandForm((v) => ({ ...v, logo: "" }))
                        }
                      >
                        Hapus logo
                      </button>
                    </div>
                  )}
                  <button className="m-primary" disabled={saving}>
                    {saving ? "Menyimpan…" : "Simpan identitas"}
                  </button>
                </form>
              </section>
            )}
            <div className="m-version">{brand} · Aplikasi Mobile</div>
          </>
        )}
      </main>
      <nav className="m-bottom-nav">
        <button
          className={tab === "home" ? "active" : ""}
          onClick={() => {
            setTab("home");
            setSearch("");
          }}
        >
          <Home />
          <span>Beranda</span>
        </button>
        <button
          className={tab === "invoices" ? "active" : ""}
          onClick={() => {
            setTab("invoices");
            setSearch("");
          }}
        >
          <Receipt />
          <span>Tagihan</span>
          {unpaid.length > 0 && (
            <i>{unpaid.length > 99 ? "99+" : unpaid.length}</i>
          )}
        </button>
        <button
          className={tab === "customers" ? "active" : ""}
          onClick={() => {
            setTab("customers");
            setSearch("");
          }}
        >
          <Users />
          <span>Pelanggan</span>
        </button>
        <button
          className={tab === "more" ? "active" : ""}
          onClick={() => {
            setTab("more");
            setSearch("");
          }}
        >
          <Menu />
          <span>Lainnya</span>
        </button>
      </nav>
      {printPreview && (
        <div className="m-sheet-backdrop" onClick={() => setPrintPreview(null)}>
          <section
            className="m-sheet m-print-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="m-sheet-head">
              <div>
                <h2>Pratinjau cetak 58 mm</h2>
                <p>
                  {printPreview.invoice.invoice_number} ·{" "}
                  {printPreview.invoice.customer_name}
                </p>
              </div>
              <button onClick={() => setPrintPreview(null)}>
                <X />
              </button>
            </div>
            <pre
              className="m-receipt-preview"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11px",
                lineHeight: 1.35,
                maxWidth: "100%",
                overflowX: "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {printPreview.lines.join("\n")}
            </pre>
            <div className="m-print-preview-actions">
              <button
                className="m-secondary"
                onClick={() => setPrintPreview(null)}
              >
                Batal
              </button>
              <button
                className="m-primary"
                disabled={printerBusy}
                onClick={confirmPrintInvoice}
              >
                {printerBusy ? "Mengirim…" : "Konfirmasi & cetak"}
              </button>
            </div>
          </section>
        </div>
      )}
      {payment && (
        <PaymentSheet
          invoice={payment}
          accounts={accounts}
          saving={saving}
          onClose={() => setPayment(null)}
          onSubmit={savePayment}
        />
      )}
      {selected && (
        <CustomerSheet
          data={selected}
          onClose={() => setSelected(null)}
          onPay={(i) => {
            setSelected(null);
            setPayment(i);
          }}
        />
      )}
      {editProfile && (
        <div className="m-sheet-backdrop" onClick={() => setEditProfile(false)}>
          <section className="m-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="m-sheet-head">
              <div>
                <h2>Profil akun</h2>
                <p>Perbarui nama dan password Anda.</p>
              </div>
              <button onClick={() => setEditProfile(false)}>
                <X />
              </button>
            </div>
            <form className="m-form" onSubmit={saveProfile}>
              <label>
                Nama tampilan
                <input
                  required
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                Username
                <input value={profile.username} disabled />
              </label>
              <label>
                Password baru (opsional)
                <input
                  type="password"
                  minLength="8"
                  value={profileForm.password}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, password: e.target.value })
                  }
                />
              </label>
              <label>
                Konfirmasi password
                <input
                  type="password"
                  value={profileForm.confirm}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, confirm: e.target.value })
                  }
                />
              </label>
              <button className="m-primary" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="m-search">
      <Search size={18} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
function InvoiceCard({ invoice: i, onPay, onDetail, onPrint, onDelete }) {
  return (
    <article className="m-invoice-card">
      <div className="m-invoice-top">
        <span className="m-invoice-no">{i.invoice_number}</span>
        <span className={`m-status ${i.status === "paid" ? "ok" : "due"}`}>
          {i.status === "paid"
            ? "Lunas"
            : i.status === "partial"
              ? "Sebagian"
              : "Belum bayar"}
        </span>
      </div>
      <button className="m-invoice-customer" onClick={onDetail}>
        {i.customer_name}
        <small>{i.customer_code}</small>
        {i.address && <small className="m-invoice-address">{i.address}</small>}
      </button>
      <div className="m-invoice-bottom">
        <div className="m-invoice-summary">
          <small>
            {i.status === "paid" ? "Total tagihan" : "Sisa tagihan"}
          </small>
          <b>{money(i.status === "paid" ? i.amount : moneyDue(i))}</b>
          <small>Jatuh tempo {fmtDate(i.due_date)}</small>
        </div>
        <div className="m-invoice-actions">
          {i.status !== "paid" && (
            <button className="m-primary m-pay-btn" onClick={onPay}>
              <CreditCard size={16} /> Bayar
            </button>
          )}
          {onPrint && (
            <button className="m-secondary m-pay-btn" onClick={onPrint}>
              Cetak 58mm
            </button>
          )}
          {onDelete && (
            <button className="m-secondary m-pay-btn" onClick={onDelete}>
              Hapus
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function PaymentSheet({ invoice: i, accounts, saving, onClose, onSubmit }) {
  const [amount, setAmount] = useState(String(moneyDue(i))),
    [method, setMethod] = useState("cash"),
    [account, setAccount] = useState(""),
    [reference, setReference] = useState("");
  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <section className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <div>
            <h2>Catat pembayaran</h2>
            <p>
              {i.invoice_number} · {i.customer_name}
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="m-due-box">
          <small>Sisa tagihan</small>
          <b>{money(moneyDue(i))}</b>
        </div>
        <form
          className="m-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              invoice_id: i.id,
              amount: Number(amount),
              method,
              account_id: method === "transfer" ? Number(account) : null,
              reference_number: reference,
            });
          }}
        >
          <label>
            Nominal pembayaran
            <input
              type="number"
              min="1"
              max={moneyDue(i)}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Metode pembayaran
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash / Tunai</option>
              <option value="transfer">Transfer bank</option>
            </select>
          </label>
          {method === "transfer" && (
            <>
              <label>
                Rekening tujuan
                <select
                  required
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">Pilih rekening</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} · {a.account_number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nomor referensi
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Opsional"
                />
              </label>
            </>
          )}
          <button className="m-primary" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan pembayaran"}
          </button>
        </form>
      </section>
    </div>
  );
}
function CustomerSheet({ data: d, onClose, onPay }) {
  const c = d.customer || {};
  const live = d.live || d.mikrotik || {};

  const statusLabel = !c.active
    ? "Nonaktif"
    : c.service_type === "tv_cable"
      ? "Tidak pakai MikroTik"
      : !c.pppoe_username
        ? "Belum terhubung"
        : c.isolation_status === "isolated"
          ? "Terisolir"
          : live?.status === "online"
            ? "Online"
            : "Offline";

  const ipLabel =
    c.service_type === "tv_cable"
      ? "—"
      : live?.status === "online" && live.ip
        ? live.ip
        : !c.pppoe_username
          ? "Belum ada PPPoE"
          : "Offline";

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <section className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <div>
            <h2>Detail pelanggan</h2>
            <p>{c?.customer_code || ""}</p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        {d.loading ? (
          <div className="m-loading">Memuat detail…</div>
        ) : (
          c && (
            <>
              <div className="m-detail-title">
                <div className="m-customer-avatar large">
                  {c.name?.slice(0, 1)?.toUpperCase()}
                </div>
                <div>
                  <b>{c.name}</b>
                  <small>
                    {c.package_name || "Tanpa paket"} ·{" "}
                    {c.coverage_area_name || "Tanpa area"}
                  </small>
                </div>
              </div>
              <div className="m-detail-grid">
                <div>
                  <small>Nomor HP</small>
                  <b>{c.phone || "-"}</b>
                </div>
                <div>
                  <small>Status</small>
                  <b>
                    {c.active && c.customer_status === "active"
                      ? "Aktif"
                      : "Nonaktif"}
                  </b>
                </div>
                <div>
                  <small>Alamat</small>
                  <b>{c.address || "-"}</b>
                </div>
                <div>
                  <small>Username PPPoE</small>
                  <b>{c.pppoe_username || "-"}</b>
                </div>
                <div>
                  <small>IP Address MikroTik</small>
                  <b>{ipLabel}</b>
                </div>
                <div>
                  <small>Status MikroTik</small>
                  <b>{statusLabel}</b>
                </div>
              </div>
              <h3 className="m-subtitle">Tagihan belum lunas</h3>
              {(d.active_invoices || []).map((i) => (
                <div className="m-detail-invoice" key={i.id}>
                  <div>
                    <b>{i.invoice_number}</b>
                    <small>
                      Jatuh tempo {fmtDate(i.due_date)} · Sisa{" "}
                      {money(moneyDue(i))}
                    </small>
                  </div>
                  <button onClick={() => onPay(i)}>Bayar</button>
                </div>
              ))}
              {!(d.active_invoices || []).length && (
                <div className="m-empty">Tidak ada tagihan aktif.</div>
              )}
              <h3 className="m-subtitle">Pembayaran terakhir</h3>
              <p className="m-last-payment">
                {d.last_payment
                  ? money(d.last_payment.amount) +
                    " · " +
                    fmtDate(d.last_payment.paid_at)
                  : "Belum ada pembayaran"}
              </p>
            </>
          )
        )}
      </section>
    </div>
  );
}