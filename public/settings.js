const formEl = document.getElementById('settings-form');
const statusEl = document.getElementById('settings-status');

async function loadSettings() {
  setStatus('Loading settings');

  try {
    const r = await fetch('/api/settings');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = await r.json();
    fillForm(data.settings);
    setStatus('Settings loaded');
  } catch (err) {
    console.error(err);
    setStatus(`Error loading settings: ${err.message}`, true);
  }
}

function fillForm(settings) {
  formEl.elements.eventDaysBack.value = settings.eventDaysBack;
  formEl.elements.prepDaysPast.value = settings.prepDaysPast;
  formEl.elements.prepDaysFuture.value = settings.prepDaysFuture;
  formEl.elements.pageSize.value = settings.pageSize;
  formEl.elements.refreshSeconds.value = settings.refreshSeconds;
  formEl.elements.officeIds.value = settings.officeIds.join(', ');
  formEl.elements.jobTypeIds.value = settings.jobTypeIds.join(', ');
}

function readForm() {
  return {
    eventDaysBack: formEl.elements.eventDaysBack.value,
    prepDaysPast: formEl.elements.prepDaysPast.value,
    prepDaysFuture: formEl.elements.prepDaysFuture.value,
    pageSize: formEl.elements.pageSize.value,
    refreshSeconds: formEl.elements.refreshSeconds.value,
    officeIds: formEl.elements.officeIds.value,
    jobTypeIds: formEl.elements.jobTypeIds.value
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error-text', isError);
}

formEl.addEventListener('submit', async event => {
  event.preventDefault();
  setStatus('Saving settings');

  try {
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readForm())
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

    fillForm(data.settings);
    setStatus('Settings saved');
  } catch (err) {
    console.error(err);
    setStatus(`Error saving settings: ${err.message}`, true);
  }
});

loadSettings();
