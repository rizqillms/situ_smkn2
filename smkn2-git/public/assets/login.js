/* SITU SMKN 2 Rantau — login page */
(() => {
  'use strict';

  const form = document.getElementById('login-form');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const submit = document.getElementById('login-submit');
  const submitLabel = document.getElementById('login-submit-label');
  const alertBox = document.getElementById('login-alert');
  const alertText = document.getElementById('login-alert-text');
  const toggle = document.getElementById('toggle-password');
  const passwordIcon = document.getElementById('password-icon');

  if (localStorage.getItem('token')) {
    window.location.replace('/');
    return;
  }

  function showError(message) {
    alertText.textContent = message;
    alertBox.classList.add('is-visible');
  }
  function clearError() {
    alertBox.classList.remove('is-visible');
    alertText.textContent = '';
  }
  function setLoading(loading) {
    submit.disabled = loading;
    submitLabel.textContent = loading ? 'Memverifikasi…' : 'Masuk';
    username.readOnly = loading;
    password.readOnly = loading;
  }

  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    passwordIcon.setAttribute('href', visible ? '#i-eye-off' : '#i-eye');
    password.focus();
  });

  [username, password].forEach((input) => input.addEventListener('input', clearError));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const userValue = username.value.trim();
    const passValue = password.value;
    if (!userValue || !passValue) {
      showError('Username dan kata sandi wajib diisi.');
      (!userValue ? username : password).focus();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userValue, password: passValue })
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        showError((data && data.error) || 'Username atau kata sandi tidak sesuai.');
        password.value = '';
        password.focus();
        setLoading(false);
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.replace('/');
    } catch {
      showError('Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.');
      setLoading(false);
    }
  });

  username.focus();
})();
