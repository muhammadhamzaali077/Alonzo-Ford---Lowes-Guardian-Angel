// Settings screens for locations, angels, managers, individuals, shift
// schedules, digest recipients, and system messages. All share a left-sidebar
// layout per the UI/UX sign-off.

import type { Angel } from '../db/queries/angels.js';
import type { Individual } from '../db/queries/individuals.js';
import type { Location } from '../db/queries/locations.js';
import type { Manager } from '../db/queries/managers.js';
import type { OpsNotice } from '../db/queries/ops-notices.js';
import type { DigestRecipient } from '../db/queries/recipients.js';
import type { ShiftScheduleRow } from '../db/queries/shift-schedule.js';
import { escapeHtml } from './layout.js';
import { locationTypeLabel } from './ui.js';

export type AdminSection =
  | 'org'
  | 'locations'
  | 'angels'
  | 'managers'
  | 'individuals'
  | 'shift_schedules'
  | 'recipients'
  | 'ops'
  | 'upload'
  | 'reset_demo'
  | 'scenarios';

const SECTIONS: Array<{ key: AdminSection; label: string; href: string }> = [
  { key: 'locations',       label: 'Locations',         href: '/admin/locations' },
  { key: 'angels',          label: 'Angels',            href: '/admin/angels' },
  { key: 'individuals',     label: 'Individuals',       href: '/admin/individuals' },
  { key: 'managers',        label: 'Managers',          href: '/admin/managers' },
  { key: 'shift_schedules', label: 'Shift schedules',   href: '/admin/shift-schedules' },
  { key: 'recipients',      label: 'Digest recipients', href: '/admin/recipients' },
  { key: 'upload',          label: 'Upload Therap export', href: '/admin/upload' },
  { key: 'ops',             label: 'System messages',   href: '/admin/ops' },
  { key: 'scenarios',       label: 'Scenario presets',  href: '/admin/scenarios' },
  { key: 'reset_demo',      label: 'Reset demo data',   href: '/admin/reset-demo' },
];

export function renderSettingsShell(active: AdminSection, body: string): string {
  const sidebarLinks = SECTIONS.map(
    (s) => `<a href="${s.href}" class="block px-3 py-2 min-h-[44px] rounded-md text-sm ${
      active === s.key ? 'bg-blue-50 text-blue-700 font-medium' : 'ga-text hover:bg-gray-50'
    }">${escapeHtml(s.label)}</a>`,
  ).join('');

  return `<section>
  <h1 class="text-2xl font-semibold ga-text-strong">Settings</h1>
  <p class="mt-1 text-sm ga-text">Manage the org data that drives flagging and the weekly email.</p>
  <div class="mt-6 grid grid-cols-1 md:grid-cols-[16rem_1fr] gap-6">
    <aside>
      <nav class="bg-white border border-gray-200 rounded-md p-2 space-y-1" aria-label="Settings sections">
        ${sidebarLinks}
      </nav>
    </aside>
    <div class="min-w-0">
      ${body}
    </div>
  </div>
</section>`;
}

// -------------------------------------------------------------------------------------------------
// Settings hub (GET /admin/org)
// -------------------------------------------------------------------------------------------------

export function renderSettingsHub(counts: {
  locations: number; angels: number; individuals: number; managers: number;
  shift_schedules: number; recipients: number; ops: number;
}): string {
  const body = `<div class="bg-white border border-gray-200 rounded-md p-5">
  <h2 class="text-lg font-medium ga-text-strong">Overview</h2>
  <p class="mt-1 text-sm ga-text">Current counts. Pick a section on the left to edit.</p>
  <dl class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
    ${countTile('Locations', counts.locations)}
    ${countTile('Angels', counts.angels)}
    ${countTile('Individuals', counts.individuals)}
    ${countTile('Managers', counts.managers)}
    ${countTile('Shift schedules', counts.shift_schedules)}
    ${countTile('Digest recipients', counts.recipients)}
  </dl>
</div>`;
  return renderSettingsShell('org', body);
}

function countTile(label: string, n: number): string {
  return `<div class="rounded-md border border-gray-200 p-4">
  <dt class="text-xs ga-text">${escapeHtml(label)}</dt>
  <dd class="mt-1 text-2xl font-semibold tnum ga-text-strong">${n}</dd>
</div>`;
}

// -------------------------------------------------------------------------------------------------
// Shared list / form helpers
// -------------------------------------------------------------------------------------------------

function entityHeader(label: string, addHref: string): string {
  return `<div class="flex items-center justify-between gap-4 flex-wrap">
  <h2 class="text-lg font-medium ga-text-strong">${escapeHtml(label)}</h2>
  <a href="${addHref}" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Add</a>
</div>`;
}

function rowActions(editHref: string, deleteHref?: string): string {
  const delBtn = deleteHref
    ? `<a href="${deleteHref}" class="text-sm text-red-700 hover:underline py-2 px-1 -my-2 -mx-1 min-h-[44px] inline-flex items-center">Delete</a>`
    : '';
  return `<div class="flex items-center gap-3 shrink-0">
  <a href="${editHref}" class="text-sm text-blue-600 hover:underline py-2 px-1 -my-2 -mx-1 min-h-[44px] inline-flex items-center">Edit</a>
  ${delBtn}
</div>`;
}

function emptyState(message: string): string {
  return `<div class="bg-white border border-gray-200 rounded-md p-5 text-sm ga-text-muted">${escapeHtml(message)}</div>`;
}

function renderForm(action: string, fields: string, submitLabel: string): string {
  return `<form method="post" action="${action}" class="space-y-4">
  ${fields}
  <div class="flex items-center gap-3 pt-4 border-t border-gray-200">
    <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">${escapeHtml(submitLabel)}</button>
    <a href="/admin/org" class="text-sm ga-text hover:text-blue-600">Cancel</a>
  </div>
</form>`;
}

function textInput(name: string, label: string, value: string, opts: { required?: boolean; placeholder?: string } = {}): string {
  const req = opts.required ? 'required' : '';
  const ph = opts.placeholder ?? '';
  return `<div>
  <label for="f-${name}" class="block text-sm font-medium ga-text-strong">${escapeHtml(label)}</label>
  <input id="f-${name}" name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(ph)}" ${req}
         class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
</div>`;
}

function selectInput(
  name: string,
  label: string,
  value: string,
  choices: Array<{ value: string; label: string }>,
): string {
  return `<div>
  <label for="f-${name}" class="block text-sm font-medium ga-text-strong">${escapeHtml(label)}</label>
  <select id="f-${name}" name="${name}"
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
    ${choices.map((c) => `<option value="${escapeHtml(c.value)}" ${c.value === value ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
  </select>
</div>`;
}

// -------------------------------------------------------------------------------------------------
// Locations
// -------------------------------------------------------------------------------------------------

export function renderLocationsList(locations: Location[], managers: Manager[]): string {
  const mgrName = (id: string | null) => managers.find((m) => m.id === id)?.name ?? '—';
  const body = `${entityHeader('Locations', '/admin/locations/new')}
  ${locations.length === 0 ? emptyState('No locations yet. Add one to start.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${locations.map((l) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(l.name)}</div>
        <div class="mt-1 text-xs ga-text-muted">${escapeHtml(locationTypeLabel(l.type))} · manager ${escapeHtml(mgrName(l.manager_id))} · ${escapeHtml(l.id)}</div>
      </div>
      ${rowActions(`/admin/locations/${encodeURIComponent(l.id)}/edit`, `/admin/locations/${encodeURIComponent(l.id)}/delete`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('locations', body);
}

export function renderLocationForm(
  location: Location | null,
  managers: Manager[],
): string {
  const isNew = !location;
  const id = location?.id ?? '';
  const name = location?.name ?? '';
  const type = location?.type ?? 'group_home';
  const manager_id = location?.manager_id ?? '';

  const fields = `
    ${textInput('id', 'Location ID', id, { required: true, placeholder: 'LOC001' })}
    ${textInput('name', 'Name', name, { required: true, placeholder: 'Peachtree Group Home' })}
    ${selectInput('type', 'Type', type, [
      { value: 'group_home', label: 'Group home' },
      { value: 'host_home', label: 'Host home' },
      { value: 'day_program', label: 'Day program' },
    ])}
    ${selectInput('manager_id', 'Manager', manager_id, [
      { value: '', label: '(none)' },
      ...managers.map((m) => ({ value: m.id, label: m.name })),
    ])}
  `;

  const action = isNew ? '/admin/locations' : `/admin/locations/${encodeURIComponent(id)}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add location' : 'Edit location'}</h2>
  <p class="mt-1 text-sm ga-text">The Location ID matches the Therap program ID.</p>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create location' : 'Save changes')}
  </div>`;
  return renderSettingsShell('locations', body);
}

export function renderLocationDeleteConfirm(
  location: Location,
  counts: { angels: number; individuals: number; tlogs: number },
): string {
  const body = `<h2 class="text-lg font-medium ga-text-strong">Deactivate location</h2>
  <p class="mt-1 text-sm ga-text">This location will be marked inactive. Historical notes and flags stay as-is.</p>
  <div class="mt-4 bg-white border border-amber-200 rounded-md p-5">
    <p class="text-sm ga-text-strong"><span class="font-medium">${escapeHtml(location.name)}</span> has ${counts.angels} angel${counts.angels === 1 ? '' : 's'}, ${counts.individuals} individual${counts.individuals === 1 ? '' : 's'}, and ${counts.tlogs} note${counts.tlogs === 1 ? '' : 's'}. Deactivating keeps every note and flag in place; the location just stops appearing in drop-downs and new dashboards.</p>
    <form method="post" action="/admin/locations/${encodeURIComponent(location.id)}/delete" class="mt-4 flex items-center gap-3">
      <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600">Deactivate location</button>
      <a href="/admin/locations" class="text-sm ga-text hover:text-blue-600">Cancel</a>
    </form>
  </div>`;
  return renderSettingsShell('locations', body);
}

// -------------------------------------------------------------------------------------------------
// Angels
// -------------------------------------------------------------------------------------------------

export function renderAngelsList(angels: Angel[], locations: Location[]): string {
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—';
  const body = `${entityHeader('Angels', '/admin/angels/new')}
  ${angels.length === 0 ? emptyState('No angels yet.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${angels.map((a) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(a.name)}</div>
        <div class="mt-1 text-xs ga-text-muted">${escapeHtml(a.role)} · ${escapeHtml(locName(a.location_id))} · ${escapeHtml(a.id)}</div>
      </div>
      ${rowActions(`/admin/angels/${encodeURIComponent(a.id)}/edit`, `/admin/angels/${encodeURIComponent(a.id)}/delete`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('angels', body);
}

export function renderAngelForm(angel: Angel | null, locations: Location[]): string {
  const isNew = !angel;
  const id = angel?.id ?? '';
  const name = angel?.name ?? '';
  const role = angel?.role ?? 'DSP';
  const loc = angel?.location_id ?? '';

  const fields = `
    ${textInput('id', 'Angel ID', id, { required: true, placeholder: 'ANG001' })}
    ${textInput('name', 'Name', name, { required: true, placeholder: 'Keisha Johnson' })}
    ${selectInput('role', 'Role', role, [
      { value: 'DSP', label: 'DSP' },
      { value: 'Nurse', label: 'Nurse' },
      { value: 'Manager', label: 'Manager' },
    ])}
    ${selectInput('location_id', 'Location', loc, [
      { value: '', label: '(none)' },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ])}
  `;
  const action = isNew ? '/admin/angels' : `/admin/angels/${encodeURIComponent(id)}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add angel' : 'Edit angel'}</h2>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create angel' : 'Save changes')}
  </div>`;
  return renderSettingsShell('angels', body);
}

export function renderAngelDeleteConfirm(angel: Angel, noteCount: number): string {
  const body = `<h2 class="text-lg font-medium ga-text-strong">Deactivate angel</h2>
  <div class="mt-4 bg-white border border-amber-200 rounded-md p-5">
    <p class="text-sm ga-text-strong"><span class="font-medium">${escapeHtml(angel.name)}</span> has ${noteCount} note${noteCount === 1 ? '' : 's'}. Deactivating marks the angel as inactive; the notes stay.</p>
    <form method="post" action="/admin/angels/${encodeURIComponent(angel.id)}/delete" class="mt-4 flex items-center gap-3">
      <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700">Deactivate angel</button>
      <a href="/admin/angels" class="text-sm ga-text hover:text-blue-600">Cancel</a>
    </form>
  </div>`;
  return renderSettingsShell('angels', body);
}

// -------------------------------------------------------------------------------------------------
// Individuals
// -------------------------------------------------------------------------------------------------

export function renderIndividualsList(individuals: Individual[], locations: Location[]): string {
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—';
  const body = `${entityHeader('Individuals', '/admin/individuals/new')}
  ${individuals.length === 0 ? emptyState('No individuals yet.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${individuals.map((i) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(i.name)}</div>
        <div class="mt-1 text-xs ga-text-muted">${escapeHtml(locName(i.location_id))} · ${escapeHtml(i.id)}</div>
      </div>
      ${rowActions(`/admin/individuals/${encodeURIComponent(i.id)}/edit`, `/admin/individuals/${encodeURIComponent(i.id)}/delete`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('individuals', body);
}

export function renderIndividualForm(individual: Individual | null, locations: Location[]): string {
  const isNew = !individual;
  const id = individual?.id ?? '';
  const name = individual?.name ?? '';
  const loc = individual?.location_id ?? '';

  const fields = `
    ${textInput('id', 'Individual ID', id, { required: true, placeholder: 'IND001' })}
    ${textInput('name', 'Name', name, { required: true, placeholder: 'John D.' })}
    ${selectInput('location_id', 'Location', loc, [
      { value: '', label: '(none)' },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ])}
  `;
  const action = isNew ? '/admin/individuals' : `/admin/individuals/${encodeURIComponent(id)}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add individual' : 'Edit individual'}</h2>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create individual' : 'Save changes')}
  </div>`;
  return renderSettingsShell('individuals', body);
}

export function renderIndividualDeleteConfirm(individual: Individual, noteCount: number): string {
  const body = `<h2 class="text-lg font-medium ga-text-strong">Deactivate individual</h2>
  <div class="mt-4 bg-white border border-amber-200 rounded-md p-5">
    <p class="text-sm ga-text-strong"><span class="font-medium">${escapeHtml(individual.name)}</span> has ${noteCount} note${noteCount === 1 ? '' : 's'}. Deactivating keeps the notes; the individual stops appearing in drop-downs.</p>
    <form method="post" action="/admin/individuals/${encodeURIComponent(individual.id)}/delete" class="mt-4 flex items-center gap-3">
      <button type="submit" class="inline-flex items-center justify-center min-h-[44px] px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700">Deactivate individual</button>
      <a href="/admin/individuals" class="text-sm ga-text hover:text-blue-600">Cancel</a>
    </form>
  </div>`;
  return renderSettingsShell('individuals', body);
}

// -------------------------------------------------------------------------------------------------
// Managers
// -------------------------------------------------------------------------------------------------

export function renderManagersList(managers: Manager[]): string {
  const body = `${entityHeader('Managers', '/admin/managers/new')}
  ${managers.length === 0 ? emptyState('No managers yet.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${managers.map((m) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(m.name)}</div>
        <div class="mt-1 text-xs ga-text-muted">${escapeHtml(m.email ?? '—')} · ${escapeHtml(m.id)}</div>
      </div>
      ${rowActions(`/admin/managers/${encodeURIComponent(m.id)}/edit`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('managers', body);
}

export function renderManagerForm(manager: Manager | null): string {
  const isNew = !manager;
  const id = manager?.id ?? '';
  const name = manager?.name ?? '';
  const email = manager?.email ?? '';

  const fields = `
    ${textInput('id', 'Manager ID', id, { required: true, placeholder: 'MGR001' })}
    ${textInput('name', 'Name', name, { required: true, placeholder: 'Vivian Daniels' })}
    ${textInput('email', 'Email', email, { placeholder: 'vivian@lowesguardianangel.com' })}
  `;
  const action = isNew ? '/admin/managers' : `/admin/managers/${encodeURIComponent(id)}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add manager' : 'Edit manager'}</h2>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create manager' : 'Save changes')}
  </div>`;
  return renderSettingsShell('managers', body);
}

// -------------------------------------------------------------------------------------------------
// Shift schedules
// -------------------------------------------------------------------------------------------------

export function renderSchedulesList(rows: ShiftScheduleRow[]): string {
  const body = `${entityHeader('Shift schedules', '/admin/shift-schedules/new')}
  <p class="mt-1 text-sm ga-text">Each row is one expected shift pattern for an individual. Missing-note flags fire against these.</p>
  ${rows.length === 0 ? emptyState('No shift schedules yet.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${rows.map((r) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(r.individual_name)} · ${escapeHtml(r.shift_name)}</div>
        <div class="mt-1 text-xs ga-text-muted tnum">${escapeHtml(r.start_time)}–${escapeHtml(r.end_time)} ET · ${escapeHtml(r.days_of_week)}</div>
      </div>
      ${rowActions(`/admin/shift-schedules/${r.id}/edit`, `/admin/shift-schedules/${r.id}/delete`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('shift_schedules', body);
}

export function renderScheduleForm(
  row: ShiftScheduleRow | null,
  individuals: Individual[],
): string {
  const isNew = !row;
  const idAttr = row?.id ?? '';
  const individual_id = row?.individual_id ?? '';
  const shift_name = row?.shift_name ?? 'Day';
  const start_time = row?.start_time ?? '09:00';
  const end_time = row?.end_time ?? '17:00';
  const days = row?.days_of_week ?? 'mon,tue,wed,thu,fri';

  const fields = `
    ${selectInput('individual_id', 'Individual', individual_id, individuals.map((i) => ({ value: i.id, label: i.name })))}
    ${selectInput('shift_name', 'Shift name', shift_name, [
      { value: 'Day', label: 'Day' },
      { value: 'Swing', label: 'Swing' },
      { value: 'Overnight', label: 'Overnight' },
    ])}
    <div class="grid grid-cols-2 gap-3">
      ${textInput('start_time', 'Start time (ET)', start_time, { required: true, placeholder: '09:00' })}
      ${textInput('end_time', 'End time (ET)', end_time, { required: true, placeholder: '17:00' })}
    </div>
    ${textInput('days_of_week', 'Days of week', days, { required: true, placeholder: 'mon,tue,wed,thu,fri' })}
    <p class="text-xs ga-text-muted">Days: comma-separated from mon, tue, wed, thu, fri, sat, sun. Use "mon,tue,wed,thu,fri" for weekdays only.</p>
  `;
  const action = isNew ? '/admin/shift-schedules' : `/admin/shift-schedules/${idAttr}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add shift schedule' : 'Edit shift schedule'}</h2>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create schedule' : 'Save changes')}
  </div>`;
  return renderSettingsShell('shift_schedules', body);
}

// -------------------------------------------------------------------------------------------------
// Recipients
// -------------------------------------------------------------------------------------------------

export function renderRecipientsList(
  recipients: DigestRecipient[],
  locations: Location[],
): string {
  const scopeLabel = (scope: string): string => {
    if (scope === 'all') return 'All locations';
    const loc = locations.find((l) => l.id === scope);
    return loc?.name ?? scope;
  };

  const body = `${entityHeader('Digest recipients', '/admin/recipients/new')}
  <p class="mt-1 text-sm ga-text">Each recipient gets a weekly compliance email scoped to their location(s).</p>
  ${recipients.length === 0 ? emptyState('No recipients yet. Add someone to receive the weekly email.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${recipients.map((r) => `<li class="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <div class="text-sm font-medium ga-text-strong">${escapeHtml(r.email)}</div>
        <div class="mt-1 text-xs ga-text-muted">${escapeHtml(scopeLabel(r.scope))} · ${r.is_active ? 'active' : 'paused'}</div>
      </div>
      ${rowActions(`/admin/recipients/${r.id}/edit`, `/admin/recipients/${r.id}/delete`)}
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('recipients', body);
}

export function renderRecipientForm(
  recipient: DigestRecipient | null,
  locations: Location[],
): string {
  const isNew = !recipient;
  const email = recipient?.email ?? '';
  const scope = recipient?.scope ?? 'all';
  const is_active = recipient?.is_active ?? 1;

  const fields = `
    ${textInput('email', 'Email', email, { required: true, placeholder: 'alonzo@lowesguardianangel.com' })}
    ${selectInput('scope', 'Scope', scope, [
      { value: 'all', label: 'All locations' },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ])}
    ${selectInput('is_active', 'Status', String(is_active), [
      { value: '1', label: 'Active' },
      { value: '0', label: 'Paused' },
    ])}
  `;
  const action = isNew ? '/admin/recipients' : `/admin/recipients/${recipient?.id}`;
  const body = `<h2 class="text-lg font-medium ga-text-strong">${isNew ? 'Add recipient' : 'Edit recipient'}</h2>
  <p class="mt-1 text-sm ga-text">Delivery: Monday 08:00 ET. (Cadence is fixed in v1.)</p>
  <div class="mt-4 bg-white border border-gray-200 rounded-md p-5">
    ${renderForm(action, fields, isNew ? 'Create recipient' : 'Save changes')}
  </div>`;
  return renderSettingsShell('recipients', body);
}

// -------------------------------------------------------------------------------------------------
// Ops notices ("System messages")
// -------------------------------------------------------------------------------------------------

const OPS_CATEGORY_LABELS: Record<string, string> = {
  digest_suppressed:            'Weekly email skipped — no notes in the window',
  classifier_permanent_failure: "System couldn't review this note after 3 tries",
  ingestion_gap:                'No notes received for this period',
  sftp_failure:                 'Could not reach Therap — retrying',
  upload_partial:               'Upload completed with skipped rows',
};

export function renderOpsNoticesList(notices: OpsNotice[]): string {
  const body = `<h2 class="text-lg font-medium ga-text-strong">System messages</h2>
  <p class="mt-1 text-sm ga-text">Operational notices from the last 50 events. Informational; no action required unless you see a pattern.</p>
  ${notices.length === 0 ? emptyState('No system messages. Everything looks quiet.') : `<ul class="mt-4 bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
    ${notices.map((n) => `<li class="px-5 py-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="text-sm font-medium ga-text-strong">${escapeHtml(OPS_CATEGORY_LABELS[n.category] ?? n.category)}</div>
          <div class="mt-1 text-sm ga-text">${escapeHtml(n.message)}</div>
        </div>
        <div class="text-xs ga-text-muted tnum shrink-0">${escapeHtml(n.created_at)}</div>
      </div>
    </li>`).join('')}
  </ul>`}`;
  return renderSettingsShell('ops', body);
}

// -------------------------------------------------------------------------------------------------
// Reset demo data (T126) — double-confirmation destructive action
// -------------------------------------------------------------------------------------------------

/**
 * Two-step reset form. Step 1 shows a calm explanatory card with a primary
 * button (`step=request`). Server re-renders with `confirmStep=true` after
 * the first click — now the form carries `step=confirm` and the button is
 * red. A second click actually runs the wipe.
 *
 * `resultMessage`, when non-null, is shown above the form after a completed
 * reseed so the user can see how many rows came back.
 */
export function renderResetDemoForm(confirmStep: boolean, resultMessage: string | null): string {
  const banner = resultMessage
    ? `<div class="mt-4 rounded-md border p-3 text-sm ga-sev-green">${escapeHtml(resultMessage)}</div>`
    : '';

  const button = confirmStep
    ? `<button type="submit" name="step" value="confirm"
               class="ga-btn"
               style="background-color: var(--ga-red); color: #ffffff; border-color: var(--ga-red);">
          Yes — reset demo data now
        </button>
        <a href="/admin/reset-demo" class="ga-btn ga-btn-ghost">Cancel</a>`
    : `<button type="submit" name="step" value="request" class="ga-btn ga-btn-secondary">
          Reset demo data…
        </button>`;

  const warning = confirmStep
    ? `<div class="mt-4 rounded-md border p-4 text-sm ga-sev-red" role="alert">
        <p class="font-medium">This will erase every flag, note, and roster row.</p>
        <p class="mt-1">After clicking, the database is wiped and re-seeded from the synthetic fixture. Your login stays active. Click <strong>Yes</strong> only if you want to start the demo over.</p>
      </div>`
    : '';

  const body = `<h2 class="ga-h2">Reset demo data</h2>
  <p class="mt-1 ga-body">Wipe every seeded row (notes, flags, schedules, roster) and reload the synthetic fixture. Useful between demos so the dashboard is back to its baseline state. Your login is preserved.</p>
  ${banner}
  ${warning}
  <form method="post" action="/admin/reset-demo" class="mt-6 flex items-center gap-3 flex-wrap">
    ${button}
  </form>
  <details class="mt-6">
    <summary class="cursor-pointer select-none text-sm ga-link">What gets reset?</summary>
    <ul class="mt-3 space-y-1 text-sm ga-text list-disc pl-5">
      <li>T-Logs (all 648 synthetic notes)</li>
      <li>Flags (red, yellow, missing)</li>
      <li>Locations, angels, individuals, managers</li>
      <li>Shift schedules and digest recipients</li>
      <li>Rule configurations (reset to defaults)</li>
      <li>Flag feedback (thumbs-up / thumbs-down history)</li>
    </ul>
    <p class="mt-3 text-sm ga-text-muted">Your login and any other logins are preserved.</p>
  </details>`;
  return renderSettingsShell('reset_demo', body);
}

// -------------------------------------------------------------------------------------------------
// Scenario presets (T123) — three-card picker with double-confirm per preset
// -------------------------------------------------------------------------------------------------

interface ScenarioCardData {
  key: string;
  label: string;
  description: string;
  severityHint: 'good' | 'neutral' | 'bad';
  active: boolean;
}

export interface RenderScenariosOpts {
  current: string;
  scenarios: Array<{ key: string; label: string; description: string; severityHint: 'good' | 'neutral' | 'bad' }>;
  /** Non-null when the last POST completed — shows a success banner. */
  appliedMessage?: string | null;
  /** When set, this scenario is one click away from being applied. */
  pendingConfirm?: string | null;
}

export function renderScenariosForm(opts: RenderScenariosOpts): string {
  const banner = opts.appliedMessage
    ? `<div class="mt-4 rounded-md border p-3 text-sm ga-sev-green">${escapeHtml(opts.appliedMessage)}</div>`
    : '';

  const cards: ScenarioCardData[] = opts.scenarios.map((s) => ({
    ...s,
    active: s.key === opts.current,
  }));

  const grid = `<div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
    ${cards.map((c) => renderScenarioCard(c, opts.pendingConfirm === c.key)).join('')}
  </div>`;

  const body = `<h2 class="ga-h2">Scenario presets</h2>
  <p class="mt-1 ga-body">Swap the shape of the seeded data to show Alonzo different states of the dashboard. Each preset wipes and re-seeds; your login stays active.</p>
  ${banner}
  ${grid}
  <p class="mt-6 text-xs ga-text-muted">Current scenario: <strong class="ga-text">${escapeHtml(opts.current)}</strong></p>`;

  return renderSettingsShell('scenarios', body);
}

function renderScenarioCard(c: ScenarioCardData, confirming: boolean): string {
  const accentVar = c.severityHint === 'good' ? '--ga-green' : c.severityHint === 'bad' ? '--ga-red' : '--ga-blue';

  const primaryButton = confirming
    ? `<button type="submit" name="step" value="confirm"
               class="ga-btn w-full"
               style="background-color: var(--ga-red); color: #ffffff; border-color: var(--ga-red);">
          Yes — apply "${escapeHtml(c.label)}"
        </button>`
    : `<button type="submit" name="step" value="request"
               class="ga-btn ga-btn-secondary w-full"
               ${c.active ? 'aria-pressed="true"' : ''}>
          ${c.active ? 'Active' : 'Apply this scenario'}
        </button>`;

  const warning = confirming
    ? `<p class="mt-2 text-xs ga-sev-red" role="alert" style="padding: 6px 8px; border-radius: 4px;">
        This wipes the database and re-seeds. Click once more to confirm.
      </p>`
    : '';

  return `<form method="post" action="/admin/scenarios" class="ga-surface rounded-md ga-shadow-sm ga-transition p-5"
          style="border: 1px solid var(--ga-border); border-left: 2px solid var(${accentVar});">
    <input type="hidden" name="preset" value="${escapeHtml(c.key)}">
    <h3 class="ga-h2">${escapeHtml(c.label)}</h3>
    <p class="mt-2 text-sm ga-text">${escapeHtml(c.description)}</p>
    ${c.active ? `<p class="mt-2 text-xs ga-text-muted" style="padding: 4px 8px; background: var(--ga-blue-bg); border-radius: 4px; display: inline-block;">Currently active</p>` : ''}
    ${warning}
    <div class="mt-4">${primaryButton}</div>
  </form>`;
}
