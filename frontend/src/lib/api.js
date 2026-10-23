export async function api(path, options = {}) {
  const token = localStorage.getItem('billing_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token && (!path.startsWith('/auth/') || path === '/auth/logout')) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    throw new Error('Backend tidak dapat dihubungi. Periksa koneksi server.');
  }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (response.status === 401 && token && !path.startsWith('/auth/login')) {
    localStorage.removeItem('billing_token');
    localStorage.removeItem('billing_user');
    window.dispatchEvent(new CustomEvent('billing:session-expired'));
  }
  if (!response.ok) throw new Error(data.error || `Permintaan gagal (${response.status})`);
  return data;
}
