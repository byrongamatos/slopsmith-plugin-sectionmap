// Section Map plugin
// Shows a minimap bar of the full song structure with clickable sections.

let _smBar = null;
let _smSections = [];
let _smDuration = 0;

const SM_COLORS = {
    'intro': '#3b82f6',
    'verse': '#22c55e',
    'chorus': '#eab308',
    'bridge': '#a855f7',
    'solo': '#ef4444',
    'outro': '#6b7280',
    'breakdown': '#f97316',
    'riff': '#06b6d4',
    'pre': '#84cc16',
    'noguitar': '#374151',
    'default': '#4b5563',
};

function _smGetColor(name) {
    const low = name.toLowerCase();
    for (const [key, color] of Object.entries(SM_COLORS)) {
        if (low.includes(key)) return color;
    }
    return SM_COLORS.default;
}

function _smCreate() {
    if (_smBar) return;
    const player = document.getElementById('player');
    if (!player) return;

    _smBar = document.createElement('div');
    _smBar.id = 'section-map';
    _smBar.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:5;height:20px;background:rgba(8,8,16,0.7);cursor:pointer;';

    // Insert as first child of player (very top)
    player.insertBefore(_smBar, player.firstChild);

    _smBar.addEventListener('click', _smOnClick);
    _smBar.addEventListener('wheel', _smOnWheel, { passive: false });
}

function _smRemove() {
    if (_smBar) {
        _smBar.remove();
        _smBar = null;
    }
}

function _smOnClick(e) {
    if (!_smDuration) return;
    const rect = _smBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * _smDuration;
    const audio = document.getElementById('audio');
    if (!audio) return;

    // Clear any active loop to prevent it from fighting the seek
    if (typeof clearLoop === 'function') clearLoop();

    // Update lastAudioTime to prevent the jump detector from resetting
    if (typeof lastAudioTime !== 'undefined') lastAudioTime = time;

    // Pause, seek, then resume — seeking during playback fails on unbuffered regions
    const wasPlaying = !audio.paused;
    if (wasPlaying) audio.pause();
    audio.currentTime = Math.max(0, time);
    if (wasPlaying) {
        audio.addEventListener('seeked', function resume() {
            audio.removeEventListener('seeked', resume);
            audio.play();
        }, { once: true });
    }
}

function _smOnWheel(e) {
    if (!_smDuration) return;
    e.preventDefault();

    const audio = document.getElementById('audio');
    if (!audio) return;

    // Calculate time delta: up (negative deltaY) = forward, down (positive deltaY) = backward
    const increment = e.ctrlKey ? 0.1 : 1; // Fine control with Ctrl modifier
    const deltaTime = -(e.deltaY > 0 ? 1 : -1) * increment; // Negate to match scroll direction to time direction
    const newTime = Math.max(0, Math.min(_smDuration, audio.currentTime + deltaTime));

    // Update lastAudioTime to prevent the jump detector from resetting
    if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;

    // Pause, seek, then resume — seeking during playback fails on unbuffered regions
    const wasPlaying = !audio.paused;
    if (wasPlaying) audio.pause();
    audio.currentTime = newTime;
    if (wasPlaying) {
        audio.addEventListener('seeked', function resume() {
            audio.removeEventListener('seeked', resume);
            audio.play();
        }, { once: true });
    }
}

function _smUpdate() {
    if (!_smBar) return;
    const sections = highway.getSections();
    const info = highway.getSongInfo();
    const t = highway.getTime();

    if (!sections || sections.length === 0 || !info.duration) return;

    _smDuration = info.duration;

    // Only rebuild if sections changed
    if (sections !== _smSections) {
        _smSections = sections;
        _smRender();
    }

    // Update playback position indicator
    const marker = document.getElementById('sm-marker');
    if (marker && _smDuration > 0) {
        const pct = (t / _smDuration) * 100;
        marker.style.left = pct + '%';
    }

    // Highlight active section
    const blocks = _smBar.querySelectorAll('.sm-block');
    let activeIdx = 0;
    for (let i = 0; i < _smSections.length; i++) {
        if (_smSections[i].time <= t) activeIdx = i;
        else break;
    }
    blocks.forEach((block, i) => {
        block.style.opacity = i === activeIdx ? '1' : '0.5';
    });
}

function _smRender() {
    if (!_smBar || !_smSections.length || !_smDuration) return;

    let html = '';

    for (let i = 0; i < _smSections.length; i++) {
        const sec = _smSections[i];
        const nextTime = i < _smSections.length - 1 ? _smSections[i + 1].time : _smDuration;
        const startPct = (sec.time / _smDuration) * 100;
        const widthPct = ((nextTime - sec.time) / _smDuration) * 100;
        const color = _smGetColor(sec.name);

        // Clean up section name for display
        let label = sec.name.replace(/\d+$/, '').trim();
        label = label.charAt(0).toUpperCase() + label.slice(1);

        html += `<div class="sm-block" style="position:absolute;left:${startPct}%;width:${widthPct}%;top:0;bottom:0;background:${color};border-right:1px solid rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:opacity 0.15s;"
            title="${label} (${_smFmt(sec.time)})">
            <span style="font-size:9px;color:rgba(255,255,255,0.8);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:0 3px;">${label}</span>
        </div>`;
    }

    // Playback position marker
    html += '<div id="sm-marker" style="position:absolute;top:0;bottom:0;width:2px;background:white;z-index:1;pointer-events:none;transition:left 0.1s linear;"></div>';

    _smBar.innerHTML = html;
    _smBar.style.position = 'relative';
}

function _smFmt(s) {
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// Poll for updates
setInterval(_smUpdate, 200);

// Hook into playSong
(function() {
    const origPlaySong = window.playSong;
    window.playSong = async function(filename, arrangement) {
        _smRemove();
        _smSections = [];
        _smDuration = 0;
        await origPlaySong(filename, arrangement);
        _smCreate();
    };
})();

// Clean up when leaving player
(function() {
    const origShowScreen = window.showScreen;
    window.showScreen = function(id) {
        if (id !== 'player') _smRemove();
        origShowScreen(id);
    };
})();
