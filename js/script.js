// Dale's Auto Body: open/closed status and the work gallery viewer
(() => {
    // ---- open now? (Kansas City time; weekdays 10am–6pm, weekends by appointment) ----
    function updateOpenStatus() {
        const el = document.getElementById('navStatus');
        if (!el) return;
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
        const get = t => parts.find(p => p.type === t)?.value;
        const day = get('weekday'); const mins = (+get('hour') % 24) * 60 + +get('minute');
        const weekday = !['Sat', 'Sun'].includes(day);
        let text, cls;
        if (isHoliday()) { text = 'Holiday today. Call before you come by'; cls = 'appt'; }
        else if (!weekday) { text = 'Weekends by appointment. Call to set a time'; cls = 'appt'; }
        else if (mins >= 600 && mins < 1080) { text = 'Open now until 6pm'; cls = 'open'; }
        else if (mins < 600) { text = 'Closed now. Opens today at 10am'; cls = 'closed'; }
        else { text = day === 'Fri' ? 'Closed now. Opens Monday at 10am' : 'Closed now. Opens tomorrow at 10am'; cls = 'closed'; }
        el.textContent = text;
        el.className = 'status-dot ' + cls;
    }
    // big US holidays: we don't promise open or closed, we ask people to call
    function isHoliday() {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
        const y = +p.find(x => x.type === 'year').value, m = +p.find(x => x.type === 'month').value, d = +p.find(x => x.type === 'day').value;
        const nth = (mo, dow, n) => { const f = new Date(y, mo - 1, 1).getDay(); return 1 + ((dow - f + 7) % 7) + (n - 1) * 7; };
        const last = (mo, dow) => { const l = new Date(y, mo, 0); return l.getDate() - ((l.getDay() - dow + 7) % 7); };
        const days = [[1, 1], [7, 4], [12, 24], [12, 25], [12, 31], [5, last(5, 1)], [9, nth(9, 1, 1)], [11, nth(11, 4, 4)], [11, nth(11, 4, 4) + 1]];
        return days.some(([mo, dd]) => mo === m && dd === d);
    }
    updateOpenStatus();
    setInterval(updateOpenStatus, 60 * 1000);

    // map loads only when asked (saves ~500 KB of Google scripts on phones)
    const mapBtn = document.getElementById('showMap');
    if (mapBtn) mapBtn.addEventListener('click', () => {
        const f = document.createElement('iframe');
        f.title = "Map showing Dale's Auto Body at 1310 State Avenue, Kansas City, KS";
        f.src = 'https://www.google.com/maps?q=1310+State+Avenue+Kansas+City+KS+66102&output=embed';
        f.referrerPolicy = 'no-referrer-when-downgrade'; f.allowFullscreen = true;
        const m = document.getElementById('map'); m.innerHTML = ''; m.appendChild(f); f.focus();
    });

    // ---- gallery lightbox: tap to enlarge, arrows / swipe / keyboard, focus returns on close ----
    const gallery = document.getElementById('gallery');
    const box = document.getElementById('lightbox');
    if (!gallery || !box) return;
    const items = [...gallery.querySelectorAll('button[data-full]')];
    const img = document.getElementById('lbImg'), cap = document.getElementById('lbCap');
    let at = 0, opener = null;
    const show = i => {
        at = (i + items.length) % items.length;
        const b = items[at], alt = b.querySelector('img').alt;
        img.src = b.dataset.full; img.alt = alt;
        cap.textContent = `${alt} (${at + 1} of ${items.length})`;
        const next = new Image(); next.src = items[(at + 1) % items.length].dataset.full; // preload the next one
    };
    const open = i => { opener = document.activeElement; show(i); box.hidden = false; document.body.style.overflow = 'hidden'; box.querySelector('.lb-close').focus(); };
    const close = () => { box.hidden = true; document.body.style.overflow = ''; img.removeAttribute('src'); if (opener) opener.focus(); };
    items.forEach((b, i) => b.addEventListener('click', () => open(i)));
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', () => show(at - 1));
    box.querySelector('.lb-next').addEventListener('click', () => show(at + 1));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', e => {
        if (box.hidden) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(at - 1);
        else if (e.key === 'ArrowRight') show(at + 1);
        else if (e.key === 'Tab') { // keep focus inside the viewer
            const f = [...box.querySelectorAll('button')]; const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1)); x0 = null; });
})();
