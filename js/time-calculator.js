/* Medical.MyAIworker.online — local time-recovery calculator */
(function () {
  'use strict';
  const TASKS = [
    { key: 'calls', label: 'Routine patient calls and questions', rate: 0.65 },
    { key: 'scheduling', label: 'Appointment scheduling and rescheduling', rate: 0.75 },
    { key: 'followup', label: 'Patient follow-up and confirmations', rate: 0.70 },
    { key: 'email', label: 'Routine inbox and message handling', rate: 0.55 },
    { key: 'data', label: 'Calendar, form, and administrative data entry', rate: 0.60 },
    { key: 'reminders', label: 'Reminders, forms, and routine updates', rate: 0.80 },
  ];
  const form = document.getElementById('timeCalculator');
  if (!form) return;
  const hourlyInput = document.getElementById('timeHourlyValue');
  const results = document.getElementById('timeResults');
  function numberFrom(input, maximum) {
    const value = Number(input.value);
    return Number.isFinite(value) && value > 0 ? Math.min(value, maximum) : 0;
  }
  function hours(value) { return value.toLocaleString('en-US', { minimumFractionDigits: value > 0 && value < 10 ? 1 : 0, maximumFractionDigits: 1 }); }
  function currency(value) { return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
  function setText(id, text) { const element = document.getElementById(id); if (element) element.textContent = text; }
  function updateRecommendations(taskResults) {
    const list = document.getElementById('timeRecommendations');
    if (!list) return;
    const strongest = taskResults.filter(function (task) { return task.recoverable > 0; }).sort(function (a, b) { return b.recoverable - a.recoverable; }).slice(0, 3);
    list.replaceChildren();
    if (!strongest.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Enter time above to generate your three strongest administrative opportunities.';
      list.appendChild(empty);
      return;
    }
    strongest.forEach(function (task) {
      const item = document.createElement('li');
      item.textContent = task.label + ': approximately ' + hours(task.recoverable) + ' hours per week potentially returned.';
      list.appendChild(item);
    });
  }
  function update() {
    let enteredWeekly = 0;
    let recoverableWeekly = 0;
    const taskResults = TASKS.map(function (task) {
      const input = form.querySelector('[data-time-task="' + task.key + '"]');
      const entered = input ? numberFrom(input, 168) : 0;
      const recoverable = entered * task.rate;
      const output = form.querySelector('[data-time-return="' + task.key + '"]');
      enteredWeekly += entered;
      recoverableWeekly += recoverable;
      if (output) output.textContent = hours(recoverable) + ' hrs/week';
      return { label: task.label, recoverable: recoverable };
    });
    const monthly = recoverableWeekly * 4.33;
    const annual = recoverableWeekly * 52;
    const workingDays = recoverableWeekly / 8;
    const hourlyValue = numberFrom(hourlyInput, 10000);
    setText('totalEnteredWeekly', hours(enteredWeekly) + ' hrs/week');
    setText('totalRecoverableWeekly', hours(recoverableWeekly) + ' hrs/week');
    setText('recoverableWeekly', hours(recoverableWeekly) + (recoverableWeekly === 1 ? ' hour every week' : ' hours every week'));
    setText('recoverableDays', hours(workingDays));
    setText('recoverableMonthly', hours(monthly));
    setText('recoverableAnnual', hours(annual));
    setText('recoverableValue', hourlyValue > 0 ? currency(annual * hourlyValue) + '/year' : 'Add hourly value');
    setText('recoverableSummary', recoverableWeekly > 0 ? 'That is about ' + hours(workingDays) + ' eight-hour working days of potential administrative capacity every week.' : 'Enter your weekly task time to reveal where AI may help most.');
    updateRecommendations(taskResults);
  }
  form.addEventListener('input', update);
  form.addEventListener('submit', function (event) { event.preventDefault(); update(); results.focus({ preventScroll: true }); results.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  form.querySelectorAll('input[type="number"]').forEach(function (input) {
    input.addEventListener('blur', function () {
      if (input.value === '') { update(); return; }
      const maximum = Number(input.max);
      const value = Number(input.value);
      const safeMaximum = Number.isFinite(maximum) ? maximum : Number.MAX_SAFE_INTEGER;
      if (!Number.isFinite(value) || value < 0) input.value = '0';
      if (value > safeMaximum) input.value = String(safeMaximum);
      update();
    });
  });
  update();
}());
