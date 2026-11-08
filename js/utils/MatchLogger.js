// Saves every match to localStorage so nothing is lost if the tab is closed.
// Results: 'finished' (someone won), 'abandoned' (ESC > Yes), 'closed' (tab closed mid-match).
class MatchLogger {
    static KEY = 'osw_matches_v1';
    static ACTIVE_KEY = 'osw_active_v1';
    static SAMPLE_EVERY = 15;     // sim seconds between time-series samples
    static SAVE_EVERY = 5000;     // real ms between snapshots of the running match
    static MAX_MATCHES = 500;

    constructor() {
        this.active = null;
        this.gm = null;
        this.nextSample = 0;
        this.lastSave = 0;
        this.recoverUnfinished();
        window.addEventListener('pagehide', () => this.saveActive());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveActive(); });
    }

    // ---------- storage ----------
    read(key, fallback) {
        try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; }
        catch (e) { return fallback; }
    }
    write(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* full or blocked */ }
    }
    clearActive() {
        try { localStorage.removeItem(MatchLogger.ACTIVE_KEY); } catch (e) { /* ignore */ }
    }
    store(rec) {
        const list = this.read(MatchLogger.KEY, []);
        list.push(rec);
        while (list.length > MatchLogger.MAX_MATCHES) list.shift();
        this.write(MatchLogger.KEY, list);
    }
    count() {
        return this.read(MatchLogger.KEY, []).length;
    }

    // A snapshot left over from last time means the tab was closed mid-match
    recoverUnfinished() {
        const rec = this.read(MatchLogger.ACTIVE_KEY, null);
        if (!rec) return;
        rec.result = 'closed';
        this.store(rec);
        this.clearActive();
    }

    // ---------- recording ----------
    begin(gm, mapName) {
        if (this.active) this.finish('abandoned');
        this.gm = gm;
        this.active = {
            v: window.GAME_CONFIG.VERSION,
            id: Date.now(),
            date: new Date().toISOString(),
            map: gm.mapId, mapName,
            f1: gm.factionMap[1], f2: gm.factionMap[2],
            mode: gm.gameMode,
            human: gm.gameMode === 'CPU_VS_CPU' ? 0 : 1,
            result: 'running', winner: 0, secs: 0,
            firstCapture: null, stats: null, planets: [0, 0], series: []
        };
        this.nextSample = 0;
        this.sample();
        this.saveActive();
    }

    countPlanets() {
        let p1 = 0, p2 = 0;
        for (const p of this.gm.planets) { if (p.owner === 1) p1++; else if (p.owner === 2) p2++; }
        return [p1, p2];
    }

    sample() {
        const gm = this.gm;
        const [p1, p2] = this.countPlanets();
        const ts = gm.frameStats.teamShips;
        this.active.series.push([Math.round(gm.simTime), p1, ts[1] || 0, p2, ts[2] || 0]);
    }

    snapshot() {
        const gm = this.gm, a = this.active;
        a.secs = Math.round(gm.simTime * 10) / 10;
        a.firstCapture = gm.firstCapture;
        a.stats = { t1: { ...gm.telemetry.summary.team1 }, t2: { ...gm.telemetry.summary.team2 } };
        a.planets = this.countPlanets();
    }

    saveActive() {
        if (!this.active) return;
        this.snapshot();
        this.write(MatchLogger.ACTIVE_KEY, this.active);
        this.lastSave = performance.now();
    }

    // Called every frame while a match runs
    tick() {
        if (!this.active) return;
        const every = MatchLogger.SAMPLE_EVERY;
        if (this.gm.simTime >= this.nextSample + every) {
            this.nextSample = Math.floor(this.gm.simTime / every) * every;
            this.sample();
        }
        if (performance.now() - this.lastSave > MatchLogger.SAVE_EVERY) this.saveActive();
    }

    finish(result, winner = 0) {
        if (!this.active) return;
        this.snapshot();
        this.sample();
        this.active.result = result;
        this.active.winner = winner;
        this.store(this.active);
        this.active = null;
        this.clearActive();
    }

    // ---------- export ----------
    exportCsv() {
        const rows = this.read(MatchLogger.KEY, []);
        if (rows.length === 0) return;
        const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
        const keys = ['spawned', 'lost', 'shipsKilled', 'damageDealt', 'damageReceived', 'planetsCaptured', 'upgrades'];
        const teamKeys = keys.map(k => k === 'spawned' ? 'shipsSpawned' : k === 'lost' ? 'shipsLost' : k);
        const head = ['id', 'date', 'version', 'map', 'map_name', 'mode', 'human_team', 'f1', 'f2',
            'result', 'winner', 'human_won', 'secs', 'first_capture_team', 'first_capture_sec',
            'end_planets_1', 'end_planets_2'];
        for (const t of [1, 2]) for (const k of keys) head.push(`t${t}_${k}`);
        head.push('series (sec:p1/ships1/p2/ships2)');

        const lines = [head.join(',')];
        for (const r of rows) {
            const humanWon = (r.result === 'finished' && r.human) ? (r.winner === 1 ? 1 : 0) : '';
            const cells = [r.id, r.date, r.v, r.map, q(r.mapName), r.mode, r.human, r.f1, r.f2,
                r.result, r.winner, humanWon, r.secs,
                r.firstCapture ? r.firstCapture.team : '', r.firstCapture ? r.firstCapture.t : '',
                r.planets[0], r.planets[1]];
            for (const t of ['t1', 't2']) {
                for (const k of teamKeys) cells.push(r.stats ? Math.round(r.stats[t][k]) : '');
            }
            cells.push(q(r.series.map(s => `${s[0]}:${s[1]}/${s[2]}/${s[3]}/${s[4]}`).join(';')));
            lines.push(cells.join(','));
        }

        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `spacewars-matches-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}