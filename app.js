/* Mantenimiento · Colegio Ibn Gabirol
 * Común a index.html (reportar) y panel.html (mantenimiento):
 * sesión con Google, llamadas al servidor (Apps Script) y avisos (Firebase). */

const APP = {
  // URL /exec de la implementación de Apps Script
  API: 'https://script.google.com/macros/s/AKfycbw6M0vx1ibzaYwh3KqJWi82bv1xvmVr7ENxsvziTkw4xLmZNLGS55MVuVG8oljTp0qfFw/exec',
  // ID de cliente OAuth (Google Cloud → Credenciales)
  CLIENT_ID: '774378075912-beca85ij4c4aqj1o0i52fi63c94vie4u.apps.googleusercontent.com',
  // Firebase → Configuración del proyecto → Tus apps → Configuración del SDK
  FIREBASE: {
    apiKey: 'AIzaSyBQ1rWllp5guQCw-uxdRUGWB5PLbYnNlok',
    authDomain: 'mantenimiento-ibngabirol.firebaseapp.com',
    projectId: 'mantenimiento-ibngabirol',
    storageBucket: 'mantenimiento-ibngabirol.firebasestorage.app',
    messagingSenderId: '774378075912',
    appId: '1:774378075912:web:9d4eb252721604f1b9debd',
  },
  // Firebase → Cloud Messaging → Certificados push web
  VAPID: 'BCq8c3l5Hfen333bBKermVGK1ss-JKoPWP_ROnoPicVTyUon2SGYbBaHwx3gaGzRNBqYYc30bGgP6zcDMRqC9BA',
  DOMINIO: 'ibngabirol.com',
  VER: '25',
};

const MOCK_MODE = !APP.API || /[?&]mock=1/.test(location.search);
const SKEY = 'mant.sesion';
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

// Sesión que llega de vuelta del inicio de sesión con redirección (#s=...)
(function () {
  const m = location.hash.match(/[#&]s=([a-f0-9]{64})/);
  if (m) { store.set(SKEY, m[1]); history.replaceState(null, '', location.pathname + location.search); }
})();

class LoginNeeded extends Error {}

async function post_(body) {
  const r = await fetch(APP.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('El servidor no responde (' + r.status + ').');
  return r.json();
}

async function api(fn, ...args) {
  if (MOCK_MODE) return MOCK[fn](...args);
  const s = store.get(SKEY);
  if (!s) throw new LoginNeeded();
  let j;
  try { j = await post_({ fn, args, s }); }
  catch (e) { throw new Error(navigator.onLine ? (e.message || 'Error de conexión.') : 'Sin conexión a internet.'); }
  if (j.login) { store.del(SKEY); throw new LoginNeeded(); }
  if (j.error) throw new Error(j.error);
  return j.ok;
}

const params = () => Object.fromEntries(new URLSearchParams(location.search));
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- Inicio de sesión ---------- */
function pantallaLogin(el, msg) {
  el.innerHTML = `<div class="login"><div class="top-l"><img src="logo-blanco.png" alt="Colegio Ibn Gabirol"><div class="wordmark"><span class="ibn">IBN</span><span class="gab">GABIROL</span></div></div>
    <h2>Mantenimiento</h2><p>Entra con tu cuenta <b>@${APP.DOMINIO}</b>. Solo hay que hacerlo una vez en este dispositivo.</p>
    <div id="gbtn"></div>${msg ? `<div class="err">${esc(msg)}</div>` : ''}<p class="lema">Excellence since 1965</p></div>`;
  const pintar = () => {
    google.accounts.id.initialize({
      client_id: APP.CLIENT_ID, hd: APP.DOMINIO, auto_select: true, itp_support: true,
      ux_mode: standalone() ? 'redirect' : 'popup',
      login_uri: APP.API,
      callback: async r => {
        $('#gbtn').innerHTML = '<p>Comprobando…</p>';
        try {
          const j = await post_({ fn: 'login', args: [r.credential] });
          if (j.error) throw new Error(j.error);
          store.set(SKEY, j.ok.s);
          location.reload();
        } catch (e) { pantallaLogin(el, e.message); }
      },
    });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es', width: 280 });
  };
  if (window.google && google.accounts) return pintar();
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = pintar;
  document.head.appendChild(sc);
}

async function salir() {
  try { if (!MOCK_MODE) await api('salir'); } catch (e) {}
  store.del(SKEY);
  location.href = './';
}

/* ---------- Avisos (notificaciones) ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

function estadoAvisos() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return esIOS() && !standalone() ? 'ios-instalar' : 'no';
  }
  if (Notification.permission === 'granted') return store.get('mant.push') ? 'activos' : 'pendiente';
  if (Notification.permission === 'denied') return 'bloqueados';
  return 'pendiente';
}

const ses = {
  get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
};

// Muestra en la barra el paso en curso y corta si tarda demasiado
function paso_(texto, promesa, seg = 25) {
  const el = document.querySelector('#avisos span');
  if (el) el.textContent = '⏳ ' + texto + '…';
  return Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(new Error('Se ha quedado parado en: ' + texto)), seg * 1000))]);
}

// Pide el token a Firebase y lo guarda en el servidor (pestaña Dispositivos)
async function registrarDispositivo_() {
  const reg = await paso_('Preparando la app', navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready));
  const v = '10.12.2';
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await paso_('Cargando Firebase', Promise.all([
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-messaging.js`),
  ]));
  const fb = getApps().length ? getApps()[0] : initializeApp(APP.FIREBASE);
  let token;
  try { token = await paso_('Conectando con Firebase', getToken(getMessaging(fb), { vapidKey: APP.VAPID, serviceWorkerRegistration: reg })); }
  catch (e) { throw new Error('Firebase: ' + (e.code || e.message || e)); }
  if (!token) throw new Error('Firebase no ha dado un identificador para este móvil.');
  try { await paso_('Guardando en el servidor', api('registrarPush', token, navigator.userAgent.slice(0, 120))); }
  catch (e) { if (e instanceof LoginNeeded) throw e; throw new Error('Servidor: ' + (e.message || e)); }
  store.set('mant.push', token);
  store.set('mant.push.sync', new Date().toDateString());
  return token;
}

async function activarAvisos() {
  if (MOCK_MODE) { store.set('mant.push', 'demo'); return true; }
  api('logCliente', 'Activar pulsado · permiso=' + Notification.permission + ' · ' + navigator.userAgent.slice(0, 90)).catch(() => {});
  let perm = Notification.permission;
  if (perm !== 'granted') {
    try { perm = await paso_('Pidiendo permiso', Notification.requestPermission(), 15); }
    catch (e) {
      perm = Notification.permission;
      if (perm !== 'granted') throw new Error('El móvil no ha mostrado la ventana de permiso.\n\nDalo a mano: Ajustes del móvil → Aplicaciones → Mantenimiento → Notificaciones → Activar. Después vuelve aquí y pulsa Activar otra vez.');
    }
  }
  if (perm !== 'granted') {
    alert('No has dado permiso para las notificaciones (' + perm + '). Puedes activarlo en Ajustes → Apps → Mantenimiento → Notificaciones.');
    return false;
  }
  await registrarDispositivo_();
  alert('✅ Avisos activados en este móvil.');
  return true;
}

function informar_(e) {
  if (!MOCK_MODE) api('logCliente', 'Avisos: ' + (e && e.message || e) + ' · ' + navigator.userAgent.slice(0, 90)).catch(() => {});
}

// Si los avisos ya estaban activos, se vuelve a registrar el móvil una vez al día (por si cambia el token)
function sincronizarAvisos_() {
  if (MOCK_MODE || store.get('mant.push.sync') === new Date().toDateString()) return;
  registrarDispositivo_().catch(e => { console.warn('Avisos:', e.message || e); informar_(e); });
}

// Barra para activar avisos: se pinta en el elemento #avisos de cada página
function barraAvisos() {
  const el = document.getElementById('avisos');
  if (!el) return;
  const st = estadoAvisos();
  if (st === 'activos') sincronizarAvisos_();
  if (st === 'activos' || st === 'no' || ses.get('mant.push.no') === '1') { el.hidden = true; return; }
  el.hidden = false;
  const x = `<button class="x" onclick="ses.set('mant.push.no','1');barraAvisos()">✕</button>`;
  if (st === 'ios-instalar') {
    el.innerHTML = `<span>📲 Para recibir avisos, pulsa <b>Compartir → Añadir a pantalla de inicio</b> y abre la app desde ahí.</span>${x}`;
  } else if (st === 'bloqueados') {
    el.innerHTML = `<span>🔕 Los avisos están bloqueados. Actívalos en Ajustes → Apps → Mantenimiento → Notificaciones.</span>${x}`;
  } else {
    el.innerHTML = `<span>🔔 Recibe un aviso en el móvil cuando cambie una incidencia. <small style="opacity:.5">v${APP.VER}</small></span><button class="on" id="bAv">Activar</button>${x}`;
    $('#bAv').onclick = () => pulsarActivar_($('#bAv'));
  }
  ventanaAvisos_(st);
}

async function pulsarActivar_(btn) {
  btn.disabled = true; btn.textContent = '…';
  try { await activarAvisos(); } catch (e) { informar_(e); alert('No se han podido activar los avisos.\n\n' + (e.message || e)); }
  cerrarVentanaAvisos_();
  barraAvisos();
}

/* Ventana que pide activar los avisos al abrir la app. Si se pulsa «Ahora no»,
   vuelve a salir al día siguiente, hasta que los avisos estén activos. */
const HOY_ = () => new Date().toDateString();

function cerrarVentanaAvisos_() {
  const v = document.getElementById('vAvisos');
  if (v) v.remove();
}

function ventanaAvisos_(st) {
  if (MOCK_MODE && !/[?&]avisos=1/.test(location.search)) return;
  if (!['pendiente', 'ios-instalar', 'bloqueados'].includes(st)) return;
  if (store.get('mant.push.pospuesto') === HOY_() || document.getElementById('vAvisos')) return;

  if (!document.getElementById('cssAvisos')) {
    const css = document.createElement('style');
    css.id = 'cssAvisos';
    css.textContent = `
      #vAvisos{position:fixed;inset:0;z-index:1000;background:rgba(10,30,20,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px}
      #vAvisos .caja{background:#fff;border-radius:22px;max-width:420px;width:100%;padding:26px 22px 18px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:inherit;animation:subeAv .25s ease-out}
      #vAvisos .ico{font-size:44px;line-height:1}
      #vAvisos h2{font-size:21px;margin:12px 0 8px;color:#0C3B2E}
      #vAvisos p{font-size:15px;line-height:1.5;color:#3D5249;margin:0 0 18px}
      #vAvisos .si{display:block;width:100%;border:0;border-radius:99px;background:#2A8FD0;color:#fff;font:inherit;font-weight:800;font-size:16px;padding:14px;cursor:pointer}
      #vAvisos .no{display:block;width:100%;border:0;background:none;color:#6B7F77;font:inherit;font-weight:700;font-size:14px;padding:12px;margin-top:4px;cursor:pointer}
      @keyframes subeAv{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
      @media (min-width:600px){#vAvisos{align-items:center}}`;
    document.head.appendChild(css);
  }

  let cuerpo;
  if (st === 'pendiente') {
    cuerpo = `<div class="ico">🔔</div><h2>Activa los avisos</h2>
      <p>Así te enteras en el momento cuando entra una incidencia o cambia su estado, sin tener que abrir la app.</p>
      <button class="si" id="vAvSi">Activar avisos</button>`;
  } else if (st === 'ios-instalar') {
    cuerpo = `<div class="ico">📲</div><h2>Instala la app para recibir avisos</h2>
      <p>En iPhone los avisos solo funcionan desde la app instalada: pulsa <b>Compartir</b> → <b>Añadir a pantalla de inicio</b> y ábrela desde ese icono.</p>`;
  } else {
    cuerpo = `<div class="ico">🔕</div><h2>Los avisos están bloqueados</h2>
      <p>Para recibirlos, ve a <b>Ajustes del móvil → Aplicaciones → Mantenimiento → Notificaciones</b> y actívalas. Después vuelve a abrir la app.</p>`;
  }

  const v = document.createElement('div');
  v.id = 'vAvisos';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.innerHTML = `<div class="caja">${cuerpo}<button class="no" id="vAvNo">Ahora no</button></div>`;
  document.body.appendChild(v);

  $('#vAvNo').onclick = () => { store.set('mant.push.pospuesto', HOY_()); cerrarVentanaAvisos_(); };
  const si = document.getElementById('vAvSi');
  if (si) si.onclick = () => pulsarActivar_(si);
}
