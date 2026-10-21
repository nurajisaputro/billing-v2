import React from 'react';

export default function PaymentHistoryTable({ rows, money }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>No. kuitansi</th>
            <th>Tanggal</th>
            <th>Pelanggan</th>
            <th>No. tagihan</th>
            <th>Metode</th>
            <th>Rekening / referensi</th>
            <th>Nominal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id}>
              <td><b>{payment.receipt_number}</b></td>
              <td>{String(payment.paid_at).replace('T', ' ').slice(0, 16)}</td>
              <td><b>{payment.customer_name}</b><small>{payment.customer_code}</small></td>
              <td>{payment.invoice_number}</td>
              <td><span className={`pill ${payment.method === 'transfer' ? 'yellow' : 'green'}`}>{payment.method === 'transfer' ? 'Transfer' : 'Cash'}</span></td>
              <td>{payment.method === 'transfer' ? `${payment.bank_name || 'Rekening tidak tersedia'} ${payment.account_number ? `· ${payment.account_number}` : ''}` : '—'}{payment.reference_number && <small>Ref: {payment.reference_number}</small>}</td>
              <td><b>{money(payment.amount)}</b></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="7" className="empty-cell">Tidak ada pembayaran pada bulan yang dipilih.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
