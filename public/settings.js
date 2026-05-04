const formEl = document.getElementById('settings-form');
const statusEl = document.getElementById('settings-status');
const officeOptionsEl = document.getElementById('office-options');
const jobTypeOptionsEl = document.getElementById('job-type-options');
const officeSummaryEl = document.getElementById('office-summary');
const jobTypeSummaryEl = document.getElementById('job-type-summary');

async function loadSettings() {
  setStatus('Loading settings');

  try {
    const r = await fetch('/api/settings');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = await r.json();
    renderCheckboxOptions('officeNames', officeOptionsEl, data.options.officeNames);
    renderCheckboxOptions('jobTypeNames', jobTypeOptionsEl, data.options.jobTypeNames);
    fillForm(data.settings, data.options);
    setStatus('Settings loaded');
  } catch (err) {
    console.error(err);
    setStatus(`Error loading settings: ${err.message}`, true);
  }
}

function fillForm(settings, options) {
  formEl.elements.eventDaysBack.value = settings.eventDaysBack;
  formEl.elements.prepDaysPast.value = settings.prepDaysPast;
  formEl.elements.prepDaysFuture.value = settings.prepDaysFuture;
  formEl.elements.pageSize.value = settings.pageSize;
  formEl.elements.refreshSeconds.value = settings.refreshSeconds;
  setCheckedValues('officeNames', settings.officeNames);
  setCheckedValues('jobTypeNames', settings.jobTypeNames);
  updateDropdownSummary(officeSummaryEl, settings.officeNames, options.officeNames, 'All offices');
  updateDropdownSummary(jobTypeSummaryEl, settings.jobTypeNames, options.jobTypeNames, 'All job types');
}

function readForm() {
  return {
    eventDaysBack: formEl.elements.eventDaysBack.value,
    prepDaysPast: formEl.elements.prepDaysPast.value,
    prepDaysFuture: formEl.elements.prepDaysFuture.value,
    pageSize: formEl.elements.pageSize.value,
    refreshSeconds: formEl.elements.refreshSeconds.value,
    officeNames: checkedValues('officeNames'),
    jobTypeNames: checkedValues('jobTypeNames')
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error-text', isError);
}

function renderCheckboxOptions(name, container, options) {
  container.replaceChildren(
    ...options.map(option => {
      const label = document.createElement('label');
      label.className = 'checkbox-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = name;
      checkbox.value = option;
      checkbox.addEventListener('change', updateFilterSummaries);

      const text = document.createElement('span');
      text.textContent = option;

      label.append(checkbox, text);
      return label;
    })
  );
}

function setCheckedValues(name, values) {
  const selected = new Set(values || []);

  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`), input => input.value);
}

function updateFilterSummaries() {
  const officeOptions = Array.from(document.querySelectorAll('input[name="officeNames"]'), input => input.value);
  const jobTypeOptions = Array.from(document.querySelectorAll('input[name="jobTypeNames"]'), input => input.value);

  updateDropdownSummary(officeSummaryEl, checkedValues('officeNames'), officeOptions, 'All offices');
  updateDropdownSummary(jobTypeSummaryEl, checkedValues('jobTypeNames'), jobTypeOptions, 'All job types');
}

function updateDropdownSummary(summaryEl, selectedValues, allValues, emptyText) {
  if (!selectedValues?.length || selectedValues.length === allValues.length) {
    summaryEl.textContent = emptyText;
  } else if (selectedValues.length <= 2) {
    summaryEl.textContent = selectedValues.join(', ');
  } else {
    summaryEl.textContent = `${selectedValues.length} selected`;
  }
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

    fillForm(data.settings, data.options);
    setStatus('Settings saved');
  } catch (err) {
    console.error(err);
    setStatus(`Error saving settings: ${err.message}`, true);
  }
});

loadSettings();
