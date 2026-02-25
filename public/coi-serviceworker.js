if (window.location.hostname !== 'localhost') {
  window.coi = { shouldRegister: true };
}
if (window.coi?.shouldRegister && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/coi-sw.js').catch(() => undefined);
}
