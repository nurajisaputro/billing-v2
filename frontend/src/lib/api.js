export async function api(path, options = {}) {
  const token = localStorage.getItem('billing_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token && (!path.startsWith('/auth/') || path === '/auth/logout')) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { headers, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
}
