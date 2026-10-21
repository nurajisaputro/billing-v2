import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  Receipt,
  CreditCard,
  Router,
  Settings,
  RefreshCw,
  Search,
  Plus,
  Wifi,
  AlertTriangle,
  Landmark,
  Banknote,
  X,
} from "lucide-react";
import PaymentHistoryTable from "./components/PaymentHistoryTable.jsx";
import { api } from "./lib/api.js";
import { money } from "./utils/format.js";

const nav = [
  ["Dashboard", LayoutDashboard],
  ["Pelanggan", Users],
  ["Paket", Package],
  ["Tagihan", Receipt],
  ["Pembayaran", CreditCard],
  ["Rekening", Landmark],
  ["MikroTik", Router],
  ["Pengaturan", Settings],
];
function App() {
  const [page, setPage] = useState("Dashboard");
  const [isolationStatus, setIsolationStatus] = useState(null);
  const [isolationLoading, setIsolationLoading] = useState(false);
  const [paymentMonth, setPaymentMonth] = useState(
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" })
      .slice(0, 7),
  );
  const [paymentHistory, setPaymentHistory] = useState({
    rows: [],
    count: 0,
    total: 0,
    month: "",
  });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [dash, setDash] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [routers, setRouters] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerServiceFilter, setCustomerServiceFilter] = useState("all");
  const [customerStatuses, setCustomerStatuses] = useState({});
  const [customerStatusCheckedAt, setCustomerStatusCheckedAt] = useState(null);
  const [notice, setNotice] = useState("");
  async function refreshCustomerStatuses() {
    try {
      const result = await api("/customers/status");
      setCustomerStatuses(result.statuses || {});
      setCustomerStatusCheckedAt(result.checkedAt || new Date().toISOString());
    } catch (e) {
      setError("Gagal memeriksa status pelanggan: " + e.message);
    }
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [d, c, i, p, r, a] = await Promise.all([
        api("/dashboard"),
        api("/customers"),
        api("/invoices"),
        api("/packages"),
        api("/routers"),
        api("/bank-accounts"),
      ]);
      setDash(d);
      setCustomers(c);
      setInvoices(i);
      setPackages(p);
      setRouters(r);
      setBankAccounts(a);
    } catch (e) {
      setError(e.message + " — pastikan backend dan database sudah aktif.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    refreshCustomerStatuses();
    const timer = setInterval(refreshCustomerStatuses, 3 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  async function validateIsolation() {
    setIsolationLoading(true);
    try {
      const result = await api("/dashboard/isolation-status");
      setIsolationStatus(result);
    } catch (e) {
      setIsolationStatus({ error: e.message });
    } finally {
      setIsolationLoading(false);
    }
  }
  async function loadPaymentHistory(month = paymentMonth) {
    setPaymentLoading(true);
    try {
      setPaymentHistory(
        await api(`/payments?month=${encodeURIComponent(month)}`),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setPaymentLoading(false);
    }
  }
  useEffect(() => {
    if (page === "Dashboard") validateIsolation();
  }, [page]);
  useEffect(() => {
    if (page === "Pembayaran") loadPaymentHistory(paymentMonth);
  }, [page, paymentMonth]);
  async function generate() {
    try {
      const r = await api("/invoices/generate", { method: "POST" });
      setNotice(`Berhasil membuat ${r.created} tagihan baru.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  function payment(invoice) {
    setPaymentTarget(invoice);
  }
  async function savePayment(data) {
    try {
      await api("/payments", { method: "POST", body: JSON.stringify(data) });
      setPaymentTarget(null);
      setNotice("Pembayaran berhasil dicatat.");
      load();
      await loadPaymentHistory(paymentMonth);
    } catch (e) {
      setError(e.message);
    }
  }
  const filteredCustomers = customers.filter(
    (c) =>
      `${c.customer_code} ${c.name} ${c.pppoe_username || ""} ${c.phone || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (customerServiceFilter === "all" ||
        c.service_type === customerServiceFilter),
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Wifi size={22} />
          </div>
          <div>
            <b>BillingNet</b>
            <small>ISP Management</small>
          </div>
        </div>
        <div className="nav-label">MENU UTAMA</div>
        {nav.map(([label, Icon]) => (
          <button
            key={label}
            className={"nav-item " + (page === label ? "active" : "")}
            onClick={() => {
              setPage(label);
              setShowForm(false);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <span className="online-dot" /> Sistem billing MVP
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">MANAJEMEN LAYANAN</div>
            <h1>{page}</h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={async () => {
                await load();
                await refreshCustomerStatuses();
              }}
              title="Refresh data dan status pelanggan"
            >
              <RefreshCw size={17} />
            </button>
            <div className="avatar">AD</div>
            <div className="admin">
              <b>Administrator</b>
              <small>Super Admin</small>
            </div>
          </div>
        </header>
        {error && (
          <div className="alert error">
            <AlertTriangle size={18} />
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {notice && (
          <div className="alert success">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {page === "Dashboard" && (
          <>
            <div className="welcome">
              <div>
                <h2>Ringkasan Billing</h2>
                <p>Pantau pelanggan, tagihan, dan pembayaran layanan Anda.</p>
              </div>
              <div className="welcome-actions">
                <button
                  className="secondary"
                  onClick={validateIsolation}
                  disabled={isolationLoading}
                >
                  <RefreshCw size={16} />
                  {isolationLoading ? "Memvalidasi…" : "Validasi MikroTik"}
                </button>
                <button className="primary" onClick={generate}>
                  <Plus size={17} /> Generate Tagihan Bulan Ini
                </button>
              </div>
            </div>
            <div className="stats">
              <Stat
                title="Total Pelanggan"
                value={dash?.customers?.total ?? "—"}
                note={`${dash?.customers?.active ?? 0} pelanggan aktif`}
                icon={Users}
              />
              <Stat
                title="Tagihan Belum Lunas"
                value={dash ? dash.invoices.unpaid_count : "—"}
                note="Tagihan menunggu pembayaran"
                icon={Receipt}
              />
              <Stat
                title="Total Tunggakan"
                value={dash ? money(dash.invoices.outstanding) : "—"}
                note="Sisa tagihan belum lunas"
                icon={CreditCard}
              />
              <Stat
                title="Pembayaran Hari Ini"
                value={dash ? money(dash.payments.today_total) : "—"}
                note="Akumulasi pembayaran masuk"
                icon={CreditCard}
              />
              <Stat
                title="Terisolir KV-ISOLIR"
                value={isolationStatus?.count ?? "—"}
                note={
                  isolationStatus?.error
                    ? "Validasi gagal"
                    : isolationStatus
                      ? isolationStatus.totalRouters === 0
                        ? "Belum ada router terdaftar"
                        : `${isolationStatus.checkedRouters.length}/${isolationStatus.totalRouters} router diperiksa`
                      : "Memerlukan validasi router"
                }
                icon={Router}
              />
            </div>
            {isolationStatus?.error && (
              <div className="info-note">
                Validasi profile KV-ISOLIR gagal: {isolationStatus.error}. Angka
                terisolir belum dapat dipastikan.
              </div>
            )}
            {isolationStatus?.failedRouters?.length > 0 && (
              <div className="info-note warning-note">
                Sebagian router gagal diperiksa:{" "}
                {isolationStatus.failedRouters
                  .map((r) => `${r.name}: ${r.error}`)
                  .join("; ")}
                . Angka yang ditampilkan hanya mencakup router yang berhasil
                diperiksa.
              </div>
            )}
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Tagihan Terbaru</h3>
                    <p>Daftar tagihan pelanggan terbaru</p>
                  </div>
                  <button
                    className="text-btn"
                    onClick={() => setPage("Tagihan")}
                  >
                    Lihat semua →
                  </button>
                </div>
                <InvoiceTable rows={invoices.slice(0, 6)} onPay={payment} />
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Status Sistem</h3>
                    <p>Koneksi router terdaftar</p>
                  </div>
                </div>
                {routers.length === 0 ? (
                  <div className="empty">
                    <Router size={26} />
                    <b>Belum ada router</b>
                    <span>Tambahkan MikroTik untuk memulai integrasi.</span>
                    <button
                      className="secondary"
                      onClick={() => setPage("MikroTik")}
                    >
                      Kelola Router
                    </button>
                  </div>
                ) : (
                  routers.map((r) => (
                    <div className="router-row" key={r.id}>
                      <div className="router-icon">
                        <Router size={18} />
                      </div>
                      <div className="router-info">
                        <b>{r.name}</b>
                        <small>
                          {r.host}:{r.port}
                        </small>
                      </div>
                      <span className={"status " + r.last_status}>
                        {r.last_status}
                      </span>
                    </div>
                  ))
                )}
                <div className="info-note">
                  Profil isolir router harus sama dengan nama profil di
                  RouterOS.
                </div>
              </section>
            </div>
          </>
        )}
        {page === "Pelanggan" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Data Pelanggan</h3>
                <p>
                  {customers.length} pelanggan terdaftar
                  {customerStatusCheckedAt
                    ? ` · status diperiksa ${new Date(customerStatusCheckedAt).toLocaleString("id-ID")}`
                    : ""}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setEditingCustomer(null);
                  setShowForm(true);
                }}
              >
                <Plus size={17} /> Tambah Pelanggan
              </button>
            </div>
            <div className="toolbar customer-toolbar">
              <div className="search">
                <Search size={17} />
                <input
                  placeholder="Cari nama, kode, PPPoE, nomor HP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="filter-select">
                <span>Jenis layanan</span>
                <select
                  value={customerServiceFilter}
                  onChange={(e) => setCustomerServiceFilter(e.target.value)}
                >
                  <option value="all">Semua layanan</option>
                  <option value="internet">Internet</option>
                  <option value="tv_cable">TV Kabel</option>
                  <option value="bundle">Bundle</option>
                </select>
              </label>
              <button
                className="secondary"
                onClick={refreshCustomerStatuses}
                disabled={loading}
              >
                <RefreshCw size={15} /> Cek status
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th>Layanan / PPPoE</th>
                    <th>Paket</th>
                    <th>Tagihan</th>
                    <th>Status / IP MikroTik</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => {
                    const live = customerStatuses[c.id];
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>{c.name}</b>
                          <small>
                            {c.customer_code} · {c.phone || "Tanpa nomor HP"}
                          </small>
                        </td>
                        <td>
                          {{
                            internet: "Internet",
                            tv_cable: "TV Kabel",
                            bundle: "Bundle",
                          }[c.service_type] || c.service_type}
                          <small>
                            {c.pppoe_username || "Tidak menggunakan PPPoE"}
                            {c.router_name ? ` · ${c.router_name}` : ""}
                          </small>
                        </td>
                        <td>
                          {c.package_name || "—"}
                          <small>{money(c.package_price)}</small>
                        </td>
                        <td>Tanggal {c.billing_day}</td>
                        <td>
                          <span
                            className={
                              "pill " +
                              (c.service_type === "tv_cable"
                                ? "yellow"
                                : c.isolation_status === "isolated"
                                  ? "red"
                                  : live?.status === "online"
                                    ? "green"
                                    : "yellow")
                            }
                          >
                            {c.service_type === "tv_cable"
                              ? "Tidak pakai MikroTik"
                              : c.isolation_status === "isolated"
                                ? "Terisolir"
                                : live?.status === "online"
                                  ? "Online"
                                  : "Offline"}
                          </span>
                          <small>
                            IP:{" "}
                            {c.service_type === "tv_cable"
                              ? "—"
                              : live?.status === "online" && live.ip
                                ? live.ip
                                : "Offline"}
                          </small>
                        </td>
                        <td>
                          <button
                            className="small-btn"
                            onClick={() => {
                              setEditingCustomer(c);
                              setShowForm(true);
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-cell">
                        Belum ada data pelanggan yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {page === "Tagihan" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Tagihan Pelanggan</h3>
                <p>Tagihan bulanan dan status pelunasan</p>
              </div>
              <button className="primary" onClick={generate}>
                <Plus size={17} /> Generate Tagihan
              </button>
            </div>
            <InvoiceTable rows={invoices} onPay={payment} />
          </section>
        )}
        {page === "Paket" && (
          <PackagePage
            packages={packages}
            routers={routers}
            onSaved={() => {
              load();
              setNotice("Paket berhasil disimpan.");
            }}
            onError={setError}
          />
        )}
        {page === "Pembayaran" && (
          <>
            <section className="panel">
              <div className="panel-head payment-filter-head">
                <div>
                  <h3>Riwayat Pembayaran</h3>
                  <p>
                    Filter pembayaran berdasarkan bulan, termasuk bulan-bulan
                    sebelumnya.
                  </p>
                </div>
                <label className="month-filter">
                  <span>Bulan pembayaran</span>
                  <input
                    type="month"
                    value={paymentMonth}
                    onChange={(e) => setPaymentMonth(e.target.value)}
                  />
                </label>
              </div>
              <div className="payment-summary">
                <div>
                  <span>Total pembayaran bulan ini</span>
                  <strong>{money(paymentHistory.total)}</strong>
                </div>
                <div>
                  <span>Jumlah transaksi</span>
                  <strong>{paymentHistory.count}</strong>
                </div>
                <div>
                  <span>Periode</span>
                  <strong>{paymentMonth}</strong>
                </div>
              </div>
              {paymentLoading ? (
                <div className="empty">Memuat riwayat pembayaran…</div>
              ) : (
                <PaymentHistoryTable rows={paymentHistory.rows} money={money} />
              )}
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Tagihan Belum Lunas</h3>
                  <p>
                    Pilih tagihan untuk mencatat pembayaran cash atau transfer.
                  </p>
                </div>
              </div>
              <InvoiceTable
                rows={invoices.filter((i) =>
                  ["unpaid", "partial"].includes(i.status),
                )}
                onPay={payment}
              />
            </section>
          </>
        )}
        {page === "Rekening" && (
          <BankAccountsPage
            accounts={bankAccounts}
            onSaved={() => {
              load();
              setNotice("Data rekening berhasil disimpan.");
            }}
            onError={setError}
          />
        )}
        {page === "MikroTik" && (
          <RouterPage
            routers={routers}
            onSaved={() => {
              load();
              setNotice("Router berhasil ditambahkan.");
            }}
            onError={setError}
          />
        )}
        {page === "Pengaturan" && (
          <SettingsPage
            onSaved={() => setNotice("Pengaturan billing disimpan.")}
            onError={setError}
          />
        )}
        {showForm && page === "Pelanggan" && (
          <CustomerForm
            key={editingCustomer?.id || "new-customer"}
            customer={editingCustomer}
            packages={packages}
            routers={routers}
            onCancel={() => {
              setShowForm(false);
              setEditingCustomer(null);
            }}
            onSaved={() => {
              setShowForm(false);
              setEditingCustomer(null);
              load();
              refreshCustomerStatuses();
              setNotice(
                editingCustomer
                  ? "Data pelanggan berhasil diperbarui."
                  : "Pelanggan berhasil ditambahkan.",
              );
            }}
            onError={setError}
          />
        )}
        {paymentTarget && (
          <PaymentModal
            invoice={paymentTarget}
            accounts={bankAccounts.filter((a) => a.is_active)}
            onClose={() => setPaymentTarget(null)}
            onSubmit={savePayment}
          />
        )}
        <footer>
          BillingNet MVP <span>·</span> Zona waktu Asia/Jakarta <span>·</span>{" "}
          {loading
            ? "Memuat data…"
            : "Terhubung ke API jika tidak ada pesan error"}
        </footer>
      </main>
    </div>
  );
}
function Stat({ title, value, note, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className="stat-icon">
          <Icon size={19} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function InvoiceTable({ rows, onPay }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>No. Tagihan</th>
            <th>Pelanggan</th>
            <th>Jatuh Tempo</th>
            <th>Total</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>
                <b>{i.invoice_number}</b>
              </td>
              <td>
                {i.customer_name}
                <small>{i.customer_code}</small>
              </td>
              <td>{String(i.due_date).slice(0, 10)}</td>
              <td>
                <b>{money(i.amount)}</b>
                <small>Sisa {money(i.amount - i.paid_amount)}</small>
              </td>
              <td>
                <span
                  className={
                    "pill " +
                    (i.status === "paid"
                      ? "green"
                      : i.status === "partial"
                        ? "yellow"
                        : "red")
                  }
                >
                  {i.status === "paid"
                    ? "Lunas"
                    : i.status === "partial"
                      ? "Sebagian"
                      : i.status === "void"
                        ? "Batal"
                        : "Belum lunas"}
                </span>
              </td>
              <td>
                {i.status !== "paid" && i.status !== "void" ? (
                  <button className="small-btn" onClick={() => onPay(i)}>
                    Bayar
                  </button>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan="6" className="empty-cell">
                Belum ada tagihan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function CustomerForm({
  customer,
  packages,
  routers,
  onCancel,
  onSaved,
  onError,
}) {
  const [f, setF] = useState(() =>
    customer
      ? {
          ...customer,
          package_id: String(customer.package_id || ""),
          router_id: String(customer.router_id || ""),
          billing_day: customer.billing_day || 1,
          due_grace_days: customer.due_grace_days || 0,
          isolation_enabled: Boolean(customer.isolation_enabled),
        }
      : {
          customer_code: "CUST-" + Date.now().toString().slice(-6),
          name: "",
          phone: "",
          address: "",
          package_id: "",
          router_id: "",
          pppoe_username: "",
          billing_day: 1,
          due_grace_days: 0,
          service_type: "internet",
          isolation_enabled: true,
          customer_status: "active",
          notes: "",
        },
  );
  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setF((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "service_type") {
        next.package_id = "";
        if (value === "tv_cable") {
          next.router_id = "";
          next.pppoe_username = "";
        }
      }
      if (name === "package_id") {
        const pkg = packages.find((p) => String(p.id) === value);
        if (pkg) {
          next.service_type = pkg.service_type;
          if (pkg.service_type === "tv_cable") {
            next.router_id = "";
            next.pppoe_username = "";
          } else if (pkg.router_id) next.router_id = String(pkg.router_id);
        }
      }
      return next;
    });
  };
  const servicePackages = packages.filter(
    (p) => p.service_type === f.service_type || p.service_type === "bundle",
  );
  async function submit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...f,
        package_id: f.package_id || null,
        router_id: f.service_type === "tv_cable" ? null : f.router_id || null,
        pppoe_username:
          f.service_type === "tv_cable" ? null : f.pppoe_username || null,
        billing_day: Number(f.billing_day),
        due_grace_days: Number(f.due_grace_days),
        isolation_enabled: Boolean(f.isolation_enabled),
      };
      await api(customer ? `/customers/${customer.id}` : "/customers", {
        method: customer ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <section className="payment-modal form-modal">
        <div className="modal-head">
          <div>
            <h3>{customer ? "Edit Pelanggan" : "Tambah Pelanggan"}</h3>
            <p>Data pelanggan dan pengaturan layanan</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </div>
        <form className="form-grid modal-form" onSubmit={submit}>
          <Field label="Kode pelanggan">
            <input
              name="customer_code"
              value={f.customer_code || ""}
              onChange={change}
              required
              disabled={Boolean(customer)}
            />
          </Field>
          <Field label="Nama pelanggan">
            <input
              name="name"
              value={f.name || ""}
              onChange={change}
              required
            />
          </Field>
          <Field label="Nomor HP">
            <input name="phone" value={f.phone || ""} onChange={change} />
          </Field>
          <Field label="Jenis layanan">
            <select
              name="service_type"
              value={f.service_type}
              onChange={change}
            >
              <option value="internet">Internet</option>
              <option value="tv_cable">TV Kabel</option>
              <option value="bundle">Bundle</option>
            </select>
          </Field>
          <Field label="Paket">
            <select name="package_id" value={f.package_id} onChange={change}>
              <option value="">Pilih paket</option>
              {servicePackages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.price)}
                </option>
              ))}
            </select>
          </Field>
          {f.service_type !== "tv_cable" && (
            <>
              <Field label="Router MikroTik">
                <select
                  name="router_id"
                  value={f.router_id}
                  onChange={change}
                  required={f.service_type !== "tv_cable"}
                >
                  <option value="">Pilih router</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.host})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Username PPPoE">
                <input
                  name="pppoe_username"
                  value={f.pppoe_username || ""}
                  onChange={change}
                  placeholder="username PPPoE"
                  required
                />
              </Field>
            </>
          )}
          {customer && (
            <Field label="Status pelanggan">
              <select
                name="customer_status"
                value={f.customer_status || "active"}
                onChange={change}
              >
                <option value="active">Aktif</option>
                <option value="suspended">Ditangguhkan</option>
                <option value="terminated">Berhenti</option>
              </select>
            </Field>
          )}
          <Field label="Tanggal billing (1–31)">
            <input
              type="number"
              min="1"
              max="31"
              name="billing_day"
              value={f.billing_day}
              onChange={change}
            />
          </Field>
          <Field label="Masa tenggang (hari)">
            <input
              type="number"
              min="0"
              name="due_grace_days"
              value={f.due_grace_days}
              onChange={change}
            />
          </Field>
          <Field label="Alamat" wide>
            <textarea
              name="address"
              value={f.address || ""}
              onChange={change}
            />
          </Field>
          <Field label="Catatan" wide>
            <textarea name="notes" value={f.notes || ""} onChange={change} />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              name="isolation_enabled"
              checked={Boolean(f.isolation_enabled)}
              onChange={change}
            />{" "}
            Izinkan isolir otomatis untuk pelanggan ini
          </label>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel}>
              Batal
            </button>
            <button className="primary">
              {customer ? "Simpan Perubahan" : "Simpan Pelanggan"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function PackagePage({ packages, routers, onSaved, onError }) {
  const blank = {
    name: "",
    service_type: "internet",
    price: "",
    ppp_profile: "",
    router_id: "",
    active: true,
  };
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function fetchProfiles() {
      if (f.service_type === "tv_cable" || !f.router_id) {
        setProfiles([]);
        return;
      }
      setProfileLoading(true);
      try {
        const result = await api(`/routers/${f.router_id}/ppp-profiles`);
        if (!cancelled) setProfiles(result.profiles || []);
      } catch (e) {
        if (!cancelled) {
          setProfiles([]);
          onError("Gagal mengambil PPP Profile dari MikroTik: " + e.message);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    fetchProfiles();
    return () => {
      cancelled = true;
    };
  }, [f.router_id, f.service_type]);
  function openNew() {
    setEditing(null);
    setF({ ...blank });
    setModalOpen(true);
  }
  function openEdit(p) {
    setEditing(p.id);
    setF({
      name: p.name,
      service_type: p.service_type,
      price: String(p.price),
      ppp_profile: p.ppp_profile || "",
      router_id: String(p.router_id || ""),
      active: Boolean(p.active),
    });
    setModalOpen(true);
  }
  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setF((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "service_type" && value === "tv_cable") {
        next.router_id = "";
        next.ppp_profile = "";
      }
      if (name === "router_id") next.ppp_profile = "";
      return next;
    });
  };
  async function submit(e) {
    e.preventDefault();
    try {
      await api(editing ? `/packages/${editing}` : "/packages", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          ...f,
          price: Number(f.price),
          router_id:
            f.service_type === "tv_cable"
              ? null
              : f.router_id
                ? Number(f.router_id)
                : null,
          ppp_profile:
            f.service_type === "tv_cable" ? null : f.ppp_profile || null,
        }),
      });
      setModalOpen(false);
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Paket Layanan</h3>
          <p>Kelola paket internet, TV kabel, dan bundling.</p>
        </div>
        <button className="primary" onClick={openNew}>
          <Plus size={17} /> Tambah Paket
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama paket</th>
              <th>Layanan</th>
              <th>Harga</th>
              <th>Router MikroTik</th>
              <th>PPP Profile</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>
                  {{
                    internet: "Internet",
                    tv_cable: "TV Kabel",
                    bundle: "Bundle",
                  }[p.service_type] || p.service_type}
                </td>
                <td>{money(p.price)}</td>
                <td>
                  {p.service_type === "tv_cable"
                    ? "Tidak menggunakan MikroTik"
                    : p.router_name || "Router belum dipilih"}
                </td>
                <td>{p.ppp_profile || "—"}</td>
                <td>
                  <span className={"pill " + (p.active ? "green" : "red")}>
                    {p.active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td>
                  <button className="small-btn" onClick={() => openEdit(p)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {packages.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-cell">
                  Belum ada paket layanan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <section className="payment-modal form-modal">
            <div className="modal-head">
              <div>
                <h3>{editing ? "Edit Paket" : "Tambah Paket"}</h3>
                <p>PPP Profile diambil langsung dari router yang dipilih.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup"
              >
                <X size={17} />
              </button>
            </div>
            <form className="form-grid modal-form" onSubmit={submit}>
              <Field label="Nama paket">
                <input required value={f.name} name="name" onChange={change} />
              </Field>
              <Field label="Jenis layanan">
                <select
                  name="service_type"
                  value={f.service_type}
                  onChange={change}
                >
                  <option value="internet">Internet</option>
                  <option value="tv_cable">TV Kabel</option>
                  <option value="bundle">Bundle</option>
                </select>
              </Field>
              <Field label="Harga bulanan (Rp)">
                <input
                  required
                  type="number"
                  min="0"
                  value={f.price}
                  name="price"
                  onChange={change}
                />
              </Field>
              {f.service_type !== "tv_cable" && (
                <>
                  <Field label="Router MikroTik">
                    <select
                      required
                      name="router_id"
                      value={f.router_id}
                      onChange={change}
                    >
                      <option value="">Pilih router</option>
                      {routers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.host})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nama PPP Profile">
                    <select
                      required
                      name="ppp_profile"
                      value={f.ppp_profile}
                      onChange={change}
                      disabled={!f.router_id || profileLoading}
                    >
                      <option value="">
                        {!f.router_id
                          ? "Pilih router terlebih dahulu"
                          : profileLoading
                            ? "Mengambil profil…"
                            : "Pilih PPP Profile"}
                      </option>
                      {profiles.map((profile) => (
                        <option key={profile} value={profile}>
                          {profile}
                        </option>
                      ))}
                    </select>
                    {f.router_id &&
                      profiles.length === 0 &&
                      !profileLoading && (
                        <small className="helper-text">
                          Tidak ada profil terbaca. Pastikan koneksi API dan
                          izin PPP.
                        </small>
                      )}
                  </Field>
                </>
              )}
              {f.service_type === "tv_cable" && (
                <div className="info-note field wide">
                  Paket TV Kabel tidak memerlukan pilihan MikroTik atau PPP
                  Profile.
                </div>
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  name="active"
                  checked={Boolean(f.active)}
                  onChange={change}
                />{" "}
                Paket aktif dan dapat dipilih
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Batal
                </button>
                <button className="primary">
                  {editing ? "Simpan Perubahan" : "Tambah Paket"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
function RouterPage({ routers, onSaved, onError }) {
  const [f, setF] = useState({
    name: "",
    host: "",
    port: 8728,
    username: "billing-api",
    password: "",
    isolation_profile: "KV-ISOLIR",
  });
  const [testing, setTesting] = useState(null);
  async function submit(e) {
    e.preventDefault();
    try {
      await api("/routers", { method: "POST", body: JSON.stringify(f) });
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }
  async function test(id) {
    setTesting(id);
    try {
      const r = await api(`/routers/${id}/test`, { method: "POST" });
      alert(`Berhasil terhubung ke ${r.identity}`);
    } catch (e) {
      onError(e.message);
    } finally {
      setTesting(null);
    }
  }
  async function validateProfile(id) {
    setTesting(id);
    try {
      const result = await api(`/routers/${id}/use-kv-isolir`, {
        method: "POST",
      });
      onSaved();
      alert(result.message);
    } catch (e) {
      onError(e.message);
    } finally {
      setTesting(null);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Router MikroTik</h3>
          <p>Konfigurasi koneksi RouterOS API</p>
        </div>
      </div>
      <div className="info-note">
        Buat user API khusus dengan hak minimum yang diperlukan. Batasi akses
        API hanya dari IP server billing atau jaringan VPN. Jangan buka port API
        ke internet publik.
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Nama router">
          <input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="IP / Host">
          <input
            required
            placeholder="10.10.10.1"
            value={f.host}
            onChange={(e) => setF({ ...f, host: e.target.value })}
          />
        </Field>
        <Field label="Port API">
          <input
            type="number"
            value={f.port}
            onChange={(e) => setF({ ...f, port: Number(e.target.value) })}
          />
        </Field>
        <Field label="Username API">
          <input
            required
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
          />
        </Field>
        <Field label="Password API">
          <input
            required
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
        </Field>
        <Field label="Profil isolir (wajib KV-ISOLIR)">
          <input required value="KV-ISOLIR" readOnly />
        </Field>
        <div className="form-actions">
          <button className="primary">Simpan Router</button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Router</th>
              <th>Host</th>
              <th>Profil isolir</th>
              <th>Status terakhir</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {routers.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                </td>
                <td>
                  {r.host}:{r.port}
                </td>
                <td>{r.isolation_profile}</td>
                <td>
                  <span
                    className={
                      "pill " +
                      (r.last_status === "online" ? "green" : "yellow")
                    }
                  >
                    {r.last_status}
                  </span>
                </td>
                <td>
                  <button
                    className="small-btn"
                    disabled={testing === r.id}
                    onClick={() => test(r.id)}
                  >
                    {testing === r.id ? "Memproses…" : "Test koneksi"}
                  </button>{" "}
                  <button
                    className="small-btn"
                    disabled={testing === r.id}
                    onClick={() => validateProfile(r.id)}
                  >
                    Validasi KV-ISOLIR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function SettingsPage({ onSaved, onError }) {
  const [f, setF] = useState({
    invoice_generation_day: 1,
    isolation_day_offset: 0,
    isolation_time: "00:05:00",
    auto_reactivate: true,
  });
  useEffect(() => {
    api("/settings/billing")
      .then((d) => setF({ ...d, auto_reactivate: Boolean(d.auto_reactivate) }))
      .catch((e) => onError(e.message));
  }, []);
  async function submit(e) {
    e.preventDefault();
    try {
      await api("/settings/billing", {
        method: "PUT",
        body: JSON.stringify(f),
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Pengaturan Billing</h3>
          <p>Atur pembuatan tagihan dan isolir otomatis</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Tanggal generate tagihan">
          <input
            type="number"
            min="1"
            max="28"
            value={f.invoice_generation_day}
            onChange={(e) =>
              setF({ ...f, invoice_generation_day: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Tambahan hari sebelum isolir">
          <input
            type="number"
            min="0"
            value={f.isolation_day_offset}
            onChange={(e) =>
              setF({ ...f, isolation_day_offset: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Jam isolir (waktu server) ">
          <input
            type="time"
            value={f.isolation_time}
            onChange={(e) => setF({ ...f, isolation_time: e.target.value })}
          />
        </Field>
        <Field label="Aktivasi kembali otomatis">
          <select
            value={String(f.auto_reactivate)}
            onChange={(e) =>
              setF({ ...f, auto_reactivate: e.target.value === "true" })
            }
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>
        <div className="form-actions">
          <button className="primary">Simpan Pengaturan</button>
        </div>
      </form>
      <div className="info-note">
        Catatan: sebelum produksi, lakukan pengujian pada satu akun pelanggan
        uji. Pastikan nama profil KV-ISOLIR ada di setiap MikroTik dan sudah
        memiliki batasan akses yang diinginkan.
      </div>
    </section>
  );
}
function PaymentModal({ invoice, accounts, onClose, onSubmit }) {
  const [f, setF] = useState({
    amount: String(Number(invoice.amount) - Number(invoice.paid_amount)),
    method: "cash",
    account_id: "",
    reference_number: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const change = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (f.method === "transfer" && !f.account_id)
      return alert("Pilih rekening tujuan transfer.");
    setSaving(true);
    try {
      await onSubmit({
        invoice_id: invoice.id,
        amount: Number(f.amount),
        method: f.method,
        account_id: f.method === "transfer" ? Number(f.account_id) : null,
        reference_number: f.reference_number,
        notes: f.notes,
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="payment-modal">
        <div className="modal-head">
          <div>
            <h3>Catat Pembayaran</h3>
            <p>
              {invoice.invoice_number} · {invoice.customer_name}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </div>
        <div className="payment-due">
          <span>Sisa tagihan</span>
          <b>{money(Number(invoice.amount) - Number(invoice.paid_amount))}</b>
        </div>
        <form className="form-grid modal-form" onSubmit={submit}>
          <Field label="Nominal pembayaran (Rp)">
            <input
              type="number"
              min="1"
              max={Number(invoice.amount) - Number(invoice.paid_amount)}
              required
              value={f.amount}
              onChange={change}
              name="amount"
            />
          </Field>
          <Field label="Metode pembayaran">
            <select name="method" value={f.method} onChange={change}>
              <option value="cash">Cash / Tunai</option>
              <option value="transfer">Transfer bank</option>
            </select>
          </Field>
          {f.method === "transfer" && (
            <>
              <Field label="Rekening tujuan" wide>
                <select
                  name="account_id"
                  value={f.account_id}
                  onChange={change}
                  required
                >
                  <option value="">Pilih rekening</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} — {a.account_number} (a.n. {a.account_name})
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <small className="helper-text">
                    Belum ada rekening aktif. Tambahkan melalui menu Rekening
                    terlebih dahulu.
                  </small>
                )}
              </Field>
              <Field label="Nomor referensi / bukti transfer">
                <input
                  name="reference_number"
                  value={f.reference_number}
                  onChange={change}
                  placeholder="Opsional"
                />
              </Field>
            </>
          )}
          <Field label="Catatan" wide>
            <textarea
              name="notes"
              value={f.notes}
              onChange={change}
              placeholder="Catatan pembayaran (opsional)"
            />
          </Field>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Batal
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan Pembayaran"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function BankAccountsPage({ accounts, onSaved, onError }) {
  const empty = {
    bank_name: "",
    account_name: "",
    account_number: "",
    branch: "",
    notes: "",
    is_active: true,
  };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);
  const change = (e) =>
    setF({
      ...f,
      [e.target.name]:
        e.target.type === "checkbox" ? e.target.checked : e.target.value,
    });
  function edit(a) {
    setEditing(a.id);
    setF({
      bank_name: a.bank_name,
      account_name: a.account_name,
      account_number: a.account_number,
      branch: a.branch || "",
      notes: a.notes || "",
      is_active: Boolean(a.is_active),
    });
  }
  function reset() {
    setEditing(null);
    setF(empty);
  }
  async function submit(e) {
    e.preventDefault();
    try {
      await api(editing ? `/bank-accounts/${editing}` : "/bank-accounts", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(f),
      });
      reset();
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Manajemen Rekening</h3>
          <p>Kelola rekening tujuan untuk menerima pembayaran transfer.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Nama bank">
          <input
            name="bank_name"
            value={f.bank_name}
            onChange={change}
            placeholder="BCA, BRI, Mandiri, BNI, dll."
            required
          />
        </Field>
        <Field label="Nama pemilik rekening">
          <input
            name="account_name"
            value={f.account_name}
            onChange={change}
            required
          />
        </Field>
        <Field label="Nomor rekening">
          <input
            name="account_number"
            value={f.account_number}
            onChange={change}
            required
          />
        </Field>
        <Field label="Cabang (opsional)">
          <input name="branch" value={f.branch} onChange={change} />
        </Field>
        <Field label="Catatan">
          <input
            name="notes"
            value={f.notes}
            onChange={change}
            placeholder="Mis. rekening utama billing"
          />
        </Field>
        <label className="check-field">
          <input
            type="checkbox"
            name="is_active"
            checked={f.is_active}
            onChange={change}
          />{" "}
          Rekening aktif dan dapat dipilih saat pembayaran
        </label>
        <div className="form-actions">
          {editing && (
            <button type="button" className="secondary" onClick={reset}>
              Batal edit
            </button>
          )}
          <button className="primary">
            <Plus size={16} />
            {editing ? "Simpan Perubahan" : "Tambah Rekening"}
          </button>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bank</th>
              <th>Nomor rekening</th>
              <th>Nama pemilik</th>
              <th>Cabang</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <b>{a.bank_name}</b>
                </td>
                <td>{a.account_number}</td>
                <td>{a.account_name}</td>
                <td>{a.branch || "—"}</td>
                <td>
                  <span className={"pill " + (a.is_active ? "green" : "red")}>
                    {a.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td>
                  <button className="small-btn" onClick={() => edit(a)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-cell">
                  Belum ada rekening. Tambahkan rekening untuk mengaktifkan
                  pilihan transfer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="info-note">
        Rekening nonaktif tetap tersimpan untuk riwayat transaksi, tetapi tidak
        muncul sebagai pilihan rekening tujuan pada pembayaran baru.
      </div>
    </section>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={"field " + (wide ? "wide" : "")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default App;
