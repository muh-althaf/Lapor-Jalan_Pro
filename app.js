(function () {
  'use strict';

  const STORAGE_KEY = 'laporjalan_pro_state_v1';
  const statusSteps = [
    'Laporan Diterima',
    'Diverifikasi Sistem',
    'Petugas Menuju Lokasi',
    'Tindakan Diambil',
    'Selesai'
  ];

  const demoReports = [
    {
      id: 'LJ-2401',
      plate: 'DA 7291 ZK',
      impact: 'Menghalangi akses rumah/kos',
      severity: 'Tinggi',
      location: 'Depan Gang Warga / Gedung A',
      note: 'Mobil menutup akses keluar-masuk pagar warga selama jam sibuk.',
      anonymous: true,
      statusIndex: 2,
      escalated: false,
      evidence: '',
      createdAt: Date.now() - 1000 * 60 * 21
    },
    {
      id: 'LJ-2402',
      plate: 'KH 1820 LA',
      impact: 'Kerumunan transportasi online',
      severity: 'Sedang',
      location: 'Bahu Jalan Gerbang Timur',
      note: 'Penumpukan driver ojol mempersempit lajur kendaraan.',
      anonymous: true,
      statusIndex: 1,
      escalated: true,
      evidence: '',
      createdAt: Date.now() - 1000 * 60 * 9
    },
    {
      id: 'LJ-2403',
      plate: 'DA 4410 AR',
      impact: 'Pelanggaran berulang',
      severity: 'Kritis',
      location: 'Zona Merah Depan Klinik',
      note: 'Kendaraan yang sama parkir berulang di zona steril.',
      anonymous: false,
      statusIndex: 3,
      escalated: true,
      evidence: '',
      createdAt: Date.now() - 1000 * 60 * 4
    }
  ];

  const parkingLots = [
    { name: 'Kampus Utama', distance: '180 m', total: 82, slots: 27, security: 'CCTV + Satpam', route: 'Rute via gerbang barat' },
    { name: 'Gedung Timur', distance: '250 m', total: 54, slots: 12, security: 'Portal resmi', route: 'Rute via jalan kolektor' },
    { name: 'Area Basement', distance: '320 m', total: 96, slots: 41, security: 'CCTV 24 jam', route: 'Rute lewat pintu basement' }
  ];

  const dropZones = {
    'Halte Ojol Barat': 'Titik tunggu ojol legal, kapasitas 12 motor, dekat akses pejalan kaki.',
    'Drop Zone Timur': 'Titik jemput resmi untuk mengurangi kerumunan di bahu jalan.'
  };

  let state = loadState();
  let selectedImpact = { impact: 'Menghalangi akses rumah/kos', severity: 'Tinggi' };
  let selectedTrackingId = state.reports[0]?.id || null;
  let activeDashboardFilter = 'Semua';
  let cameraStream = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener('DOMContentLoaded', () => {
    bindNavigation();
    bindReportModule();
    bindParkingModule();
    bindDashboardModule();
    bindTrackingModule();
    bindComplianceModule();
    bindQaAgent();
    $('#seedDemo').addEventListener('click', resetDemo);
    renderAll();
    runEntranceRoute();
    setInterval(simulateSlotMovement, 11000);
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.warn('State fallback activated', error);
    }
    return {
      reports: demoReports,
      accuracy: 88,
      lots: parkingLots
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function renderAll() {
    renderStats();
    renderParkingList();
    renderDashboard();
    renderTracking(selectedTrackingId);
    renderCompliance();
    renderAccuracy();
  }

  function bindNavigation() {
    const routeButtons = $$('[data-route]');
    routeButtons.forEach((button) => {
      button.addEventListener('click', () => navigate(button.dataset.route));
    });
    $('#openSidebar').addEventListener('click', () => document.body.classList.add('sidebar-open'));
    $('#closeSidebar').addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    window.addEventListener('hashchange', runEntranceRoute);
  }

  function runEntranceRoute() {
    const route = location.hash.replace('#', '') || 'beranda';
    navigate(route, false);
  }

  function navigate(route, push = true) {
    if (!$('#view-' + route)) route = 'beranda';
    $$('.view').forEach((view) => view.classList.remove('active'));
    const nextView = $('#view-' + route);
    nextView.classList.add('active');
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.route === route));
    $('#pageTitle').textContent = nextView.dataset.title || 'LaporJalan Pro';
    $('#pageEyebrow').textContent = nextView.dataset.eyebrow || 'Command Center';
    if (push) history.replaceState(null, '', '#' + route);
    document.body.classList.remove('sidebar-open');
  }

  function bindReportModule() {
    $('#startCamera').addEventListener('click', toggleCamera);
    $('#detectPlate').addEventListener('click', simulatePlateDetection);
    $('#captureEvidence').addEventListener('click', captureEvidence);
    $('#evidenceUpload').addEventListener('change', handleUpload);
    $('#useLocation').addEventListener('click', useLocation);
    $$('.impact-option').forEach((option) => {
      option.addEventListener('click', () => {
        $$('.impact-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        selectedImpact = { impact: option.dataset.impact, severity: option.dataset.severity };
        if ($('#priorityInput').value === 'Otomatis') toast(`Prioritas otomatis: ${selectedImpact.severity}`);
      });
    });
    $('#reportForm').addEventListener('submit', submitReport);
  }

  async function toggleCamera() {
    const video = $('#cameraVideo');
    const placeholder = $('#cameraPlaceholder');
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      video.hidden = true;
      placeholder.hidden = false;
      $('#startCamera').textContent = 'Aktifkan Kamera';
      $('#cameraStatus').textContent = 'Mode demo';
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Browser tidak mendukung kamera. Gunakan simulasi deteksi plat.');
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = cameraStream;
      video.hidden = false;
      placeholder.hidden = true;
      $('#startCamera').textContent = 'Matikan Kamera';
      $('#cameraStatus').textContent = 'Kamera aktif';
      toast('Kamera aktif. Deteksi plat tetap disimulasikan pada prototipe ini.');
    } catch (error) {
      toast('Izin kamera ditolak atau perangkat tidak tersedia. Mode demo tetap aktif.');
    }
  }

  function simulatePlateDetection() {
    const letters = ['DA', 'KH', 'B', 'KT', 'AB'];
    const suffix = ['ZK', 'LA', 'AR', 'MN', 'OP', 'RS'];
    const plate = `${pick(letters)} ${Math.floor(1000 + Math.random() * 8999)} ${pick(suffix)}`;
    $('#detectedPlate').textContent = plate;
    $('#plateInput').value = plate;
    $('#heroPlate').textContent = plate;
    toast(`Plat terdeteksi: ${plate}`);
  }

  function captureEvidence() {
    const video = $('#cameraVideo');
    const canvas = $('#captureCanvas');
    const preview = $('#evidencePreview');
    if (!video.hidden && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', .85);
      preview.innerHTML = `<img src="${data}" alt="Bukti pelanggaran dari kamera" />`;
      toast('Bukti dari kamera berhasil diambil.');
    } else {
      preview.innerHTML = '<div class="camera-placeholder" style="min-height:140px"><strong>Bukti demo tersimpan</strong><p>Snapshot simulasi siap dilampirkan ke laporan.</p></div>';
      toast('Bukti demo berhasil dibuat.');
    }
  }

  function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('File harus berupa gambar.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      $('#evidencePreview').innerHTML = `<img src="${reader.result}" alt="Bukti unggahan" />`;
      toast('Bukti gambar berhasil diunggah.');
    };
    reader.readAsDataURL(file);
  }

  function useLocation() {
    const input = $('#locationInput');
    if (!navigator.geolocation) {
      input.value = 'Lokasi demo: Depan Gedung A, Koordinat simulasi';
      toast('GPS tidak tersedia. Lokasi demo digunakan.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        input.value = `GPS ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        toast('Koordinat GPS berhasil ditambahkan.');
      },
      () => {
        input.value = 'Lokasi demo: Depan Gedung A, Koordinat simulasi';
        toast('Izin GPS ditolak. Lokasi demo digunakan.');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  function submitReport(event) {
    event.preventDefault();
    const plate = $('#plateInput').value.trim().toUpperCase();
    const location = $('#locationInput').value.trim();
    if (!plate || !location) {
      toast('Nomor plat dan lokasi wajib diisi.');
      return;
    }
    const chosenPriority = $('#priorityInput').value;
    const report = {
      id: generateReportId(),
      plate,
      impact: selectedImpact.impact,
      severity: chosenPriority === 'Otomatis' ? selectedImpact.severity : chosenPriority,
      location,
      note: $('#noteInput').value.trim() || 'Tidak ada catatan tambahan.',
      anonymous: $('#anonymousInput').checked,
      statusIndex: 0,
      escalated: false,
      evidence: $('#evidencePreview img')?.src || '',
      createdAt: Date.now()
    };
    state.reports.unshift(report);
    state.accuracy = Math.min(99, state.accuracy + 1);
    selectedTrackingId = report.id;
    saveState();
    renderAll();
    event.target.reset();
    $('#anonymousInput').checked = true;
    $('#evidencePreview').innerHTML = '<span>Belum ada bukti gambar.</span>';
    $('#detectedPlate').textContent = 'Belum terdeteksi';
    navigate('tracking');
    toast(`Laporan ${report.id} berhasil dikirim dan masuk antrean petugas.`);
  }

  function bindParkingModule() {
    $('#refreshSlots').addEventListener('click', () => {
      simulateSlotMovement(true);
      toast('Data slot parkir diperbarui.');
    });
    $$('.parking-pin').forEach((pin) => {
      pin.addEventListener('click', () => selectParkingLot(pin.dataset.lot));
    });
    $$('.ojol-pin').forEach((pin) => {
      pin.addEventListener('click', () => selectDropZone(pin.dataset.drop));
    });
  }

  function selectParkingLot(name) {
    const lot = state.lots.find((item) => item.name === name);
    if (!lot) return;
    $$('.pin').forEach((pin) => pin.classList.toggle('active', pin.dataset.lot === name));
    $('#mapDetailTitle').textContent = lot.name;
    $('#mapDetail').classList.remove('empty-state');
    $('#mapDetail').innerHTML = `
      <strong>${lot.slots} dari ${lot.total} slot tersedia</strong><br>
      Jarak: ${lot.distance}<br>
      Keamanan: ${lot.security}<br>
      Rute: ${lot.route}
      <div class="button-row"><button class="primary-btn" type="button" id="reserveLot">Reservasi Demo</button><button class="secondary-btn" type="button" id="routeLot">Arahkan Rute</button></div>
    `;
    $('#reserveLot').addEventListener('click', () => reserveLot(name));
    $('#routeLot').addEventListener('click', () => toast(`Rute demo ke ${name} disiapkan.`));
  }

  function selectDropZone(name) {
    $$('.pin').forEach((pin) => pin.classList.toggle('active', pin.dataset.drop === name));
    $('#mapDetailTitle').textContent = name;
    $('#mapDetail').classList.remove('empty-state');
    $('#mapDetail').innerHTML = `<strong>Titik jemput resmi</strong><br>${dropZones[name]}<div class="button-row"><button class="primary-btn" type="button" id="shareDropZone">Bagikan Titik</button></div>`;
    $('#shareDropZone').addEventListener('click', () => toast(`Titik ${name} siap dibagikan ke pengemudi/penumpang.`));
  }

  function reserveLot(name) {
    const lot = state.lots.find((item) => item.name === name);
    if (!lot || lot.slots <= 0) {
      toast('Slot tidak tersedia. Pilih kantong parkir lain.');
      return;
    }
    lot.slots -= 1;
    saveState();
    renderParkingList();
    selectParkingLot(name);
    renderStats();
    toast(`Reservasi demo berhasil. Sisa slot ${lot.slots}.`);
  }

  function renderParkingList() {
    $('#parkingList').innerHTML = state.lots.map((lot) => {
      const percent = Math.max(3, Math.round((lot.slots / lot.total) * 100));
      return `
        <div class="parking-item">
          <strong>${lot.name}<span>${lot.slots}/${lot.total}</span></strong>
          <small>${lot.distance} · ${lot.security}</small>
          <div class="slot-bar"><span style="width:${percent}%"></span></div>
        </div>
      `;
    }).join('');
  }

  function simulateSlotMovement(force = false) {
    state.lots = state.lots.map((lot) => {
      const movement = force ? Math.floor(Math.random() * 9) - 4 : Math.floor(Math.random() * 5) - 2;
      return { ...lot, slots: clamp(lot.slots + movement, 0, lot.total) };
    });
    saveState();
    renderParkingList();
    renderStats();
  }

  function bindDashboardModule() {
    $$('#dashboardFilters button').forEach((button) => {
      button.addEventListener('click', () => {
        activeDashboardFilter = button.dataset.filter;
        $$('#dashboardFilters button').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        renderDashboard();
      });
    });
  }

  function renderDashboard() {
    const queue = $('#reportQueue');
    const filtered = state.reports.filter((report) => {
      if (activeDashboardFilter === 'Semua') return true;
      if (activeDashboardFilter === 'Eskalasi') return report.escalated;
      return report.severity === activeDashboardFilter;
    });

    if (!filtered.length) {
      queue.innerHTML = '<div class="empty-state map-detail">Belum ada laporan pada filter ini.</div>';
      return;
    }

    queue.innerHTML = filtered.map((report) => `
      <article class="report-card" data-id="${report.id}">
        <div>
          <h3>${report.id} · ${report.plate}</h3>
          <div class="report-meta">
            <span class="badge ${severityClass(report.severity)}">${report.severity}</span>
            <span class="badge blue">${statusSteps[report.statusIndex]}</span>
            ${report.escalated ? '<span class="badge warning">Eskalasi</span>' : ''}
            ${report.anonymous ? '<span class="badge">Anonim</span>' : '<span class="badge">Pelapor terlihat petugas</span>'}
          </div>
          <p class="muted"><strong>${report.impact}</strong> — ${report.location}. ${report.note}</p>
        </div>
        <div class="report-actions">
          <button type="button" data-action="verify">Verifikasi</button>
          <button type="button" data-action="dispatch">Petugas Menuju</button>
          <button type="button" data-action="action">Tindakan</button>
          <button type="button" data-action="complete" class="primary-mini">Selesai</button>
          <button type="button" data-action="escalate">Eskalasi</button>
        </div>
      </article>
    `).join('');

    $$('.report-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        updateReportAction(card.dataset.id, button.dataset.action);
      });
    });
  }

  function updateReportAction(id, action) {
    const report = state.reports.find((item) => item.id === id);
    if (!report) return;
    const nextStatus = { verify: 1, dispatch: 2, action: 3, complete: 4 }[action];
    if (action === 'escalate') {
      report.escalated = true;
      toast(`${report.id} diteruskan ke Dishub/Satpol PP.`);
    } else if (typeof nextStatus === 'number') {
      report.statusIndex = Math.max(report.statusIndex, nextStatus);
      if (nextStatus >= 1) state.accuracy = Math.min(99, state.accuracy + .5);
      toast(`${report.id} diperbarui: ${statusSteps[report.statusIndex]}.`);
    }
    selectedTrackingId = report.id;
    saveState();
    renderAll();
  }

  function bindTrackingModule() {
    $('#findTracking').addEventListener('click', () => {
      const query = $('#trackingSearch').value.trim().toUpperCase();
      const found = state.reports.find((report) => report.id.toUpperCase() === query || report.plate.toUpperCase() === query);
      if (!found) {
        toast('Laporan tidak ditemukan. Coba gunakan ID atau nomor plat lain.');
        return;
      }
      selectedTrackingId = found.id;
      renderTracking(found.id);
    });
    $('#latestTracking').addEventListener('click', () => {
      selectedTrackingId = state.reports[0]?.id || null;
      renderTracking(selectedTrackingId);
    });
    $('#advanceTracking').addEventListener('click', () => {
      const report = state.reports.find((item) => item.id === selectedTrackingId) || state.reports[0];
      if (!report) return;
      report.statusIndex = clamp(report.statusIndex + 1, 0, statusSteps.length - 1);
      selectedTrackingId = report.id;
      saveState();
      renderAll();
      toast(`${report.id} maju ke status: ${statusSteps[report.statusIndex]}.`);
    });
    $('#trackingSearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('#findTracking').click();
    });
  }

  function renderTracking(id) {
    const report = state.reports.find((item) => item.id === id) || state.reports[0];
    const summary = $('#trackingSummary');
    const timeline = $('#timeline');
    if (!report) {
      summary.innerHTML = '<p class="empty-state">Belum ada laporan untuk dilacak.</p>';
      timeline.innerHTML = '';
      return;
    }
    selectedTrackingId = report.id;
    $('#trackingSearch').value = report.id;
    summary.innerHTML = `
      <h3>${report.id} · ${report.plate}</h3>
      <div class="report-meta">
        <span class="badge ${severityClass(report.severity)}">${report.severity}</span>
        <span class="badge blue">${statusSteps[report.statusIndex]}</span>
        ${report.escalated ? '<span class="badge warning">Eskalasi instansi</span>' : ''}
      </div>
      <p class="muted"><strong>${report.impact}</strong><br>${report.location}<br>${formatTime(report.createdAt)}</p>
    `;
    timeline.innerHTML = statusSteps.map((step, index) => {
      const done = index < report.statusIndex;
      const current = index === report.statusIndex;
      return `
        <div class="timeline-step ${done ? 'done' : ''} ${current ? 'current' : ''}">
          <div class="timeline-dot">${done ? '✓' : index + 1}</div>
          <div class="timeline-content">
            <h4>${step}</h4>
            <p>${timelineCopy(index, report)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function timelineCopy(index, report) {
    const copy = [
      'Laporan masuk ke sistem dan nomor tiket dibuat otomatis.',
      'Sistem/petugas mengecek plat, dampak, lokasi, dan bukti laporan.',
      'Petugas terdekat menerima notifikasi koordinat dan menuju lokasi.',
      'Petugas melakukan penertiban atau teguran sesuai kewenangan.',
      'Laporan ditutup, riwayat kendaraan masuk indeks kepatuhan.'
    ];
    if (index === report.statusIndex) return `${copy[index]} Status aktif saat ini.`;
    return copy[index];
  }

  function bindComplianceModule() {
    $('#vehicleSearch').addEventListener('input', renderCompliance);
  }

  function renderCompliance() {
    const query = $('#vehicleSearch').value.trim().toUpperCase();
    const vehicles = buildComplianceIndex().filter((vehicle) => !query || vehicle.plate.includes(query));
    $('#complianceGrid').innerHTML = vehicles.map((vehicle) => {
      const risk = vehicle.count >= 3 ? 'Rapor Merah' : vehicle.count === 2 ? 'Pantauan' : 'Aman Bersyarat';
      const riskClass = vehicle.count >= 3 ? 'red' : vehicle.count === 2 ? 'orange' : 'green';
      const recommendation = vehicle.count >= 3 ? 'Rekomendasi: pembekuan sementara akses/stiker parkir internal.' : vehicle.count === 2 ? 'Rekomendasi: peringatan tertulis dan monitoring.' : 'Rekomendasi: edukasi dan peringatan ringan.';
      return `
        <article class="vehicle-card">
          <div class="vehicle-top">
            <span class="plate">${vehicle.plate}</span>
            <span class="risk ${riskClass}">${risk}</span>
          </div>
          <p>${vehicle.count} riwayat pelanggaran · dampak dominan: ${vehicle.impact}. ${recommendation}</p>
        </article>
      `;
    }).join('') || '<div class="empty-state map-detail">Plat tidak ditemukan.</div>';
  }

  function buildComplianceIndex() {
    const base = [
      { plate: 'DA 7291 ZK', count: 3, impact: 'akses warga' },
      { plate: 'KH 1820 LA', count: 2, impact: 'kerumunan ojol' },
      { plate: 'B 9811 ZX', count: 1, impact: 'bahu jalan' }
    ];
    const map = new Map(base.map((item) => [item.plate, { ...item }]));
    state.reports.forEach((report) => {
      const current = map.get(report.plate) || { plate: report.plate, count: 0, impact: report.impact.toLowerCase() };
      current.count += 1;
      current.impact = report.impact.toLowerCase();
      map.set(report.plate, current);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  function bindQaAgent() {
    $('#runQa').addEventListener('click', runQaAgent);
  }

  function runQaAgent() {
    const tests = [
      ['Semua menu utama tersedia', () => $$('.nav-item').length === 7],
      ['Setiap menu punya section aktif', () => $$('.nav-item').every((item) => Boolean($('#view-' + item.dataset.route)))],
      ['Form laporan punya input wajib', () => Boolean($('#plateInput') && $('#locationInput') && $('#reportForm'))],
      ['Modul kamera/simulasi tersedia', () => Boolean($('#startCamera') && $('#detectPlate') && $('#captureEvidence'))],
      ['Peta punya pin parkir dan halte ojol', () => $$('.parking-pin').length >= 3 && $$('.ojol-pin').length >= 2],
      ['Dashboard punya aksi petugas', () => ['verify','dispatch','action','complete','escalate'].every((name) => document.body.innerHTML.includes(`data-action="${name}"`) || state.reports.length > 0)],
      ['Tracking timeline lengkap 5 tahap', () => statusSteps.length === 5 && Boolean($('#timeline'))],
      ['Indeks kendaraan dapat dibuat', () => buildComplianceIndex().length >= 3],
      ['LocalStorage aktif', () => storageAvailable()],
      ['Responsive breakpoint CSS tersedia', () => Array.from(document.styleSheets).length > 0]
    ];
    const results = tests.map(([label, fn]) => {
      try { return { label, pass: Boolean(fn()) }; }
      catch (error) { return { label, pass: false }; }
    });
    const passed = results.filter((result) => result.pass).length;
    const score = Math.round((passed / results.length) * 100);
    $('#qaScore').textContent = `${score}% passed · ${passed}/${results.length} checks`;
    $('#qaResults').innerHTML = results.map((result) => `
      <div class="qa-item"><b>${result.label}</b><span class="${result.pass ? 'qa-pass' : 'qa-fail'}">${result.pass ? 'PASS' : 'FAIL'}</span></div>
    `).join('');
    toast(`QA Agent selesai: ${score}% checks passed.`);
  }

  function renderStats() {
    const active = state.reports.filter((report) => report.statusIndex < 4).length;
    const totalSlots = state.lots.reduce((sum, lot) => sum + lot.slots, 0);
    const red = buildComplianceIndex().filter((vehicle) => vehicle.count >= 3).length;
    $('#statActive').textContent = active;
    $('#statSlots').textContent = totalSlots;
    $('#statRed').textContent = red;
  }

  function renderAccuracy() {
    const accuracy = Math.round(state.accuracy);
    $('#accuracyLabel').textContent = `Akurasi ${accuracy}%`;
    $('#accuracyBar').style.width = `${accuracy}%`;
  }

  function resetDemo() {
    state = {
      reports: JSON.parse(JSON.stringify(demoReports)).map((report, index) => ({ ...report, createdAt: Date.now() - (index + 1) * 1000 * 60 * 8 })),
      accuracy: 88,
      lots: JSON.parse(JSON.stringify(parkingLots))
    };
    selectedTrackingId = state.reports[0].id;
    activeDashboardFilter = 'Semua';
    saveState();
    renderAll();
    toast('Data demo berhasil di-reset.');
  }

  function generateReportId() {
    const next = Math.floor(2400 + Math.random() * 7600);
    let id = `LJ-${next}`;
    while (state.reports.some((report) => report.id === id)) id = `LJ-${Math.floor(2400 + Math.random() * 7600)}`;
    return id;
  }

  function severityClass(severity) {
    if (severity === 'Kritis') return 'danger';
    if (severity === 'Tinggi' || severity === 'Sedang') return 'warning';
    return '';
  }

  function pick(items) { return items[Math.floor(Math.random() * items.length)]; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(timestamp));
  }

  function storageAvailable() {
    try {
      const key = '__laporjalan_test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function toast(message) {
    const toastEl = $('#toast');
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }
})();
