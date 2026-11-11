import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const DISMISSED_KEY = 'billing_update_dismissed_code';

export default function AppUpdateChecker() {
  const [update, setUpdate] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function checkForUpdate() {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const [installed, response] = await Promise.all([
          CapacitorApp.getInfo(),
          fetch(`${API_BASE_URL}/api/app-update`, { cache: 'no-store' })
        ]);
        if (!response.ok) return;
        const latest = await response.json();
        const installedCode = Number(installed.build || 1);
        const latestCode = Number(latest.versionCode || 1);
        if (!latest.apkUrl || !Number.isInteger(latestCode) || latestCode <= installedCode || !alive) return;
        const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
        if (!latest.forceUpdate && dismissed === latestCode) return;
        setUpdate({ ...latest, installedVersion: installed.version || 'versi terpasang' });
      } catch (error) {
        console.warn('Pemeriksaan update aplikasi gagal:', error);
      }
    }
    checkForUpdate();
    return () => { alive = false; };
  }, []);

  async function downloadUpdate() {
    if (!update?.apkUrl || busy) return;
    setBusy(true);
    try {
      await Browser.open({ url: update.apkUrl, presentationStyle: 'fullscreen' });
    } catch (error) {
      window.open(update.apkUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }

  function later() {
    if (update?.forceUpdate) return;
    localStorage.setItem(DISMISSED_KEY, String(update.versionCode));
    setUpdate(null);
  }

  if (!update) return null;
  return <div style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(10,18,32,.72)',display:'grid',placeItems:'center',padding:20}}>
    <section role="dialog" aria-modal="true" aria-labelledby="app-update-title" style={{width:'100%',maxWidth:420,background:'#fff',color:'#172033',borderRadius:18,padding:24,boxShadow:'0 24px 80px rgba(0,0,0,.3)'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
        <div style={{width:46,height:46,borderRadius:14,display:'grid',placeItems:'center',background:'#e8f0ff',color:'#2459c5',fontSize:24}}>↻</div>
        <div><div style={{fontSize:12,color:'#64748b'}}>PEMBARUAN APLIKASI</div><strong id="app-update-title" style={{fontSize:20}}>Versi baru tersedia</strong></div>
      </div>
      <p style={{margin:'8px 0',lineHeight:1.5}}>Versi saat ini <b>{update.installedVersion}</b>. Versi terbaru <b>{update.version}</b>.</p>
      {update.releaseNotes && <p style={{whiteSpace:'pre-line',fontSize:14,color:'#475569',lineHeight:1.5}}>{update.releaseNotes}</p>}
      <button onClick={downloadUpdate} disabled={busy} style={{width:'100%',border:0,borderRadius:10,padding:13,background:'#2459c5',color:'#fff',fontWeight:700,fontSize:15,marginTop:10}}>{busy?'Membuka halaman download…':'Download Update APK'}</button>
      <p style={{fontSize:12,color:'#64748b',lineHeight:1.5,margin:'12px 0 0'}}>Setelah APK selesai diunduh, buka file tersebut dan setujui pemasangan dari Android. Aplikasi harus ditandatangani dengan kunci yang sama agar dapat memperbarui instalasi lama.</p>
      {!update.forceUpdate && <button onClick={later} style={{width:'100%',border:0,background:'transparent',padding:12,color:'#475569',fontWeight:600,marginTop:4}}>Nanti</button>}
      {update.forceUpdate && <p style={{fontSize:12,color:'#b42318',fontWeight:700,textAlign:'center',margin:'12px 0 0'}}>Pembaruan ini wajib dipasang untuk melanjutkan.</p>}
    </section>
  </div>;
}
