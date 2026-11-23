function download(name, content, type) {
  const blob = new Blob([content], { type });
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function exportTrip() {
  download(
    'Tandem-Roads-Trip.json',
    JSON.stringify(
      { app: 'Tandem Roads', schema: 1, exportedAt: new Date().toISOString(), state: S },
      null,
      2,
    ),
    'application/json',
  );
  toast('Trip backup exported. Import it in this app on your other device.');
}
function exportCSV() {
  let items;
  if (location.hash.startsWith('#/trip')) {
    items = S.trip.flatMap((id) => {
      const picks = S.saved.map((pid) => P[pid]).filter((p) => p.cityId === id);
      return picks.length ? picks : C[id].items.map((p) => P[p.id]);
    });
  } else items = S.saved.map((id) => P[id]);
  if (!items.length) {
    toast('Save some places or add destinations first.');
    return;
  }
  // Notes and source links come with each city's detail file.
  if (
    !withCities(
      items.map((p) => p.cityId),
      exportCSV,
    )
  )
    return;
  const csvcell = (x) => {
    let v = String(x ?? '');
    if (/^[=+@]/.test(v) || (/^\-/.test(v) && !/^\-\d+(\.\d+)?$/.test(v))) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const rows = [
    [
      'Name',
      'City',
      'Country',
      'Latitude',
      'Longitude',
      'Category',
      'Notes',
      'Google Maps',
      'Source',
    ],
    ...items.map((p) => [
      p.name,
      p.cityName,
      C[p.cityId].country,
      p.lat,
      p.lon,
      typesFor(p).join(' / '),
      [p.summary, (p.mustOrder || []).join(', '), p.tip, S.notes[p.id] || ''].join(' '),
      mapsPin(p),
      p.sourceUrls?.[0] || '',
    ]),
  ];
  download(
    'Tandem-Roads-Google-My-Maps-Pins.csv',
    '\uFEFF' + rows.map((r) => r.map(csvcell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
  toast(`${items.length} pins exported. Import the CSV in Google My Maps.`);
}
function importTrip() {
  $('#import-file').click();
}
function importPreview(obj) {
  if (
    !obj ||
    !['Tandem Roads', 'Roam Atlas'].includes(obj.app) ||
    obj.schema !== 1 ||
    typeof obj.state !== 'object' ||
    obj.state === null ||
    Array.isArray(obj.state)
  )
    throw Error('This is not a supported Tandem Roads trip backup.');
  const incoming = cleanState(obj.state);
  window.pendingImport = incoming;
  showModal(
    `<div class="modalcontent"><span class="eyebrow">BRING YOUR JOURNEY WITH YOU</span><h2>Import this trip?</h2><p class="muted">This backup contains ${incoming.trip.length} destinations, ${incoming.saved.length} saved places, ${Object.keys(incoming.stays).length} stays and ${Object.keys(incoming.notes).length} notes.</p><p style="font-size:13px">Merge keeps your current destinations and saved places, and applies the imported days and notes. Replace starts from the backup.</p><div class="actions"><button class="btn" data-action="import-merge">Merge with this device</button><button class="btn light" data-action="import-replace">Replace this device’s plan</button></div></div>`,
    'Import trip backup',
  );
}
function doImport(merge) {
  const incoming = window.pendingImport;
  if (!incoming) return;
  if (merge)
    S = cleanState({
      ...incoming,
      saved: [...new Set([...S.saved, ...incoming.saved])],
      trip: [...new Set([...S.trip, ...incoming.trip])],
      visited: [...new Set([...S.visited, ...incoming.visited])],
      days: { ...S.days, ...incoming.days },
      notes: { ...S.notes, ...incoming.notes },
      lodging: { ...S.lodging, ...incoming.lodging },
      extra: { ...S.extra, ...incoming.extra },
      stays: { ...S.stays, ...incoming.stays },
      checklist: [...new Set([...S.checklist, ...incoming.checklist])],
    });
  else S = incoming;
  window.pendingImport = null;
  persist();
  closeModal();
  location.hash = '#/trip';
  renderTrip();
  toast('Your trip is ready on this device.');
}
